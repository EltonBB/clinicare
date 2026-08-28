import { NextResponse } from "next/server";

import { generateAnalyticsSnapshotsForBusiness } from "@/lib/analytics-ai";
import { isProBusinessPlan } from "@/lib/billing";
import { mapWithConcurrency } from "@/lib/concurrency";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { hasTimeFor, QUERY_RESERVE_MS, withDeadline } from "@/lib/deadline";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// Each Pro business runs a heavy report build + up to ~50s of AI calls; give the
// batch room beyond the platform default. Requires a Vercel plan allowing this.
// NOTE: this is a ceiling request, not a guarantee — Vercel clamps it to the
// plan's cap (Hobby: 60s). The run therefore self-limits via
// ANALYTICS_RUN_BUDGET_MS below rather than relying on this number.
export const maxDuration = 300;

// Process a few tenants at a time: enough to finish the batch in time, bounded
// so concurrent AI calls don't spike spend or hit provider rate limits. Each
// business itself fans out 3 concurrent OpenAI calls (daily/weekly/monthly —
// see generateAnalyticsSnapshotsForBusiness), so real peak concurrent OpenAI
// calls is ANALYTICS_CONCURRENCY * 3 (15 at this setting), not this number —
// size provider rate limits against that, not against this constant directly.
// At ~50s/business worst case, this many Pro tenants theoretically don't all
// fit in one 300s run — the oldest-first ordering below makes that self-healing
// (whichever tenants miss this run sort first next time) instead of silently
// leaving the same tenants stale forever.
const ANALYTICS_CONCURRENCY = 5;

// Wall-clock budget for one run, under the smallest plan cap (Hobby: 60s).
// Bounds both when a tenant may START and how long one may RUN — the remaining
// budget is passed into generateAnalyticsSnapshotsForBusiness.
const ANALYTICS_RUN_BUDGET_MS = 50_000;

// Minimum to START a tenant. Below this it is skipped rather than begun: a
// tenant that can only reach the AI failure path writes fallback snapshots that
// refresh its own `generatedAt`, so stalest-first sorts it to the back and it
// can be cycled forever without ever being analysed.
//
//   5s  SNAPSHOT_PERSIST_RESERVE_MS (analytics-ai.ts) held back for the writes
// + 5s  MIN_USABLE_AI_MS            (analytics-ai.ts) floor for a real attempt
// +10s  workspace fetch + report build, the slow part on a cold database
// = 20s
const MIN_TENANT_BUDGET_MS = 20_000;

// Hard backstop, below the platform cap: a missed interior guard costs
// completeness, never the response.
const HARD_RESPONSE_DEADLINE_MS = 55_000;

type TenantResult = {
  businessId: string;
  generated: number;
  failed: number;
  errored: boolean;
  skipped: boolean;
};

type AnalyticsBatch = { processedBusinesses: number; results: TenantResult[] };

/** Unique sentinel so no legitimate batch value can be mistaken for a timeout. */
const TIMED_OUT: unique symbol = Symbol("analytics-timed-out");

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  // Both anchored at ENTRY: deriving the hard one later left a stalled setup
  // query uncovered and pushed the backstop past the platform cap.
  const startedAt = Date.now();
  const runDeadlineAt = startedAt + ANALYTICS_RUN_BUDGET_MS;
  const hardDeadlineAt = startedAt + HARD_RESPONSE_DEADLINE_MS;

  // Mutated as tenants finish, so a hard timeout can report how far the run
  // actually got instead of presenting an overrun as a clean empty run.
  const progress = { total: 0, finished: 0, skipped: 0, errored: 0 };

  try {
    const outcome = await withDeadline<AnalyticsBatch | typeof TIMED_OUT>(
      runAnalyticsBatch(runDeadlineAt, progress),
      hardDeadlineAt,
      () => TIMED_OUT
    );

    if (outcome === TIMED_OUT) {
      return NextResponse.json(
        {
          ok: true,
          timedOut: true,
          processedBusinesses: progress.total,
          // Tenants never reached PLUS ones that completed as deadline-skips.
          // Counting a deadline-skip as "finished" would erase it here, even
          // though no snapshot was persisted for it.
          skippedBusinesses: Math.max(
            0,
            progress.total - progress.finished + progress.skipped
          ),
          erroredBusinesses: progress.errored,
          results: [],
          triggeredAt: new Date().toISOString(),
        },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        timedOut: false,
        processedBusinesses: outcome.processedBusinesses,
        skippedBusinesses: outcome.results.filter((result) => result.skipped).length,
        erroredBusinesses: outcome.results.filter((result) => result.errored).length,
        results: outcome.results,
        triggeredAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("Analytics cron job failed.", error);
    return NextResponse.json(
      { ok: false, error: "Analytics cron job failed." },
      { status: 500 }
    );
  }
}

/**
 * The whole batch INCLUDING its setup queries, so the hard backstop covers them
 * too. `progress` is mutated as tenants finish so a timeout can be reported
 * honestly rather than as a clean run.
 */
async function runAnalyticsBatch(
  runDeadlineAt: number,
  progress: { total: number; finished: number; skipped: number; errored: number }
): Promise<AnalyticsBatch> {
  const businesses = await prisma.business.findMany({
    where: { planStatus: "ACTIVE" },
    select: { id: true, plan: true },
  });
  const proBusinesses = businesses.filter((business) =>
    isProBusinessPlan(business.plan)
  );
  progress.total = proBusinesses.length;

  if (proBusinesses.length === 0) {
    return { processedBusinesses: 0, results: [] };
  }

  // Between the two setup queries: the tenant lookup may have taken the budget.
  if (!hasTimeFor(runDeadlineAt, QUERY_RESERVE_MS)) {
    return {
      processedBusinesses: proBusinesses.length,
      results: proBusinesses.map((business) => ({
        businessId: business.id,
        generated: 0,
        failed: 0,
        errored: false,
        skipped: true,
      })),
    };
  }

  // Stalest-first: if a run can't reach every tenant, the businesses most
  // overdue for a fresh snapshot go first — and any tenant that misses this run
  // has an even older generatedAt next time, so it can't be perpetually starved
  // by always landing at the back of a fixed order.
  const staleness = await prisma.analyticsSnapshot.groupBy({
    by: ["businessId"],
    where: { businessId: { in: proBusinesses.map((business) => business.id) } },
    _max: { generatedAt: true },
  });
  const lastGeneratedAt = new Map(
    staleness.map((row) => [row.businessId, row._max.generatedAt])
  );
  const orderedBusinesses = [...proBusinesses].sort((a, b) => {
    // Never generated sorts first (treated as maximally stale).
    const aTime = lastGeneratedAt.get(a.id)?.getTime() ?? 0;
    const bTime = lastGeneratedAt.get(b.id)?.getTime() ?? 0;
    return aTime - bTime;
  });

  const results = await mapWithConcurrency(
    orderedBusinesses,
    ANALYTICS_CONCURRENCY,
    async (business): Promise<TenantResult> => {
      // Admission needs room for a genuine attempt, not merely an unexpired
      // deadline — see MIN_TENANT_BUDGET_MS.
      if (!hasTimeFor(runDeadlineAt, MIN_TENANT_BUDGET_MS)) {
        progress.finished += 1;
        progress.skipped += 1;
        return {
          businessId: business.id,
          generated: 0,
          failed: 0,
          errored: false,
          skipped: true,
        };
      }

      try {
        const snapshots = await generateAnalyticsSnapshotsForBusiness(business.id, {
          force: true,
          // Absolute, so every phase before the first AI call is counted.
          deadlineAt: runDeadlineAt,
        });

        // A tenant that ran out of time before genuinely attempting AI wrote
        // nothing, so it counts as SKIPPED rather than failed — reporting it as
        // processed both hid it from the truncation signal and implied its
        // snapshots had been refreshed.
        const deadlineSkipped = snapshots.every(
          (snapshot) => snapshot.deadlineSkipped
        );

        progress.finished += 1;
        if (deadlineSkipped) {
          progress.skipped += 1;
        }
        return {
          businessId: business.id,
          generated: snapshots.filter((snapshot) => snapshot.usedAi).length,
          failed: deadlineSkipped
            ? 0
            : snapshots.filter((snapshot) => !snapshot.usedAi).length,
          errored: false,
          skipped: deadlineSkipped,
        };
      } catch (error) {
        // Isolate per-tenant failures so one bad business can't abort the batch.
        logger.error("Analytics snapshot generation failed for business.", error, {
          businessId: business.id,
        });
        // Counted, not just logged: on the timeout path `results` is empty and
        // an errored tenant increments `finished`, so without this it vanishes
        // from the skip math and the run reads clean.
        progress.errored += 1;
        progress.finished += 1;
        return {
          businessId: business.id,
          generated: 0,
          failed: 0,
          errored: true,
          skipped: false,
        };
      }
    }
  );

  return { processedBusinesses: proBusinesses.length, results };
}
