import { NextResponse } from "next/server";

import { generateAnalyticsSnapshotsForBusiness } from "@/lib/analytics-ai";
import { isProBusinessPlan } from "@/lib/billing";
import { mapWithConcurrency } from "@/lib/concurrency";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// Each Pro business runs a heavy report build + up to ~50s of AI calls; give the
// batch room beyond the platform default. Requires a Vercel plan allowing this.
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

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const businesses = await prisma.business.findMany({
    where: {
      planStatus: "ACTIVE",
    },
    select: {
      id: true,
      plan: true,
    },
  });
  const proBusinesses = businesses.filter((business) =>
    isProBusinessPlan(business.plan)
  );

  // Stalest-first: if a run can't reach every tenant before maxDuration, the
  // businesses most overdue for a fresh snapshot go first — and any tenant
  // that misses this run has an even older generatedAt next time, so it can't
  // be perpetually starved by always landing at the back of a fixed order.
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
    async (business) => {
      try {
        const snapshots = await generateAnalyticsSnapshotsForBusiness(business.id, {
          force: true,
        });
        return {
          businessId: business.id,
          generated: snapshots.filter((snapshot) => snapshot.usedAi).length,
          failed: snapshots.filter((snapshot) => !snapshot.usedAi).length,
          errored: false,
        };
      } catch (error) {
        // Isolate per-tenant failures so one bad business can't abort the batch.
        logger.error("Analytics snapshot generation failed for business.", error, {
          businessId: business.id,
        });
        return { businessId: business.id, generated: 0, failed: 0, errored: true };
      }
    }
  );

  return NextResponse.json(
    {
      ok: true,
      processedBusinesses: proBusinesses.length,
      results,
      triggeredAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
