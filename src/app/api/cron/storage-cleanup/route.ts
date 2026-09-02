import { NextResponse } from "next/server";

import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { sweepPendingStorageCleanup } from "@/lib/media-storage-server";

export const dynamic = "force-dynamic";
// Sized against the sweep's own worst case, not guessed: CLEANUP_SWEEP_BATCH_LIMIT
// (50) / CLEANUP_SWEEP_CONCURRENCY (5) = 10 sequential worker-pool waves, each
// capped at STORAGE_CALL_TIMEOUT_MS (20s) if every in-flight Storage call hangs
// for the full timeout — up to ~200s in the exact Storage-outage scenario this
// sweep exists to drain. 300s (confirmed available on this project's plan —
// see PROJECT_STATUS.md, the same ceiling reminders/analytics already use)
// gives real headroom over that ceiling, not just over the typical case. No
// hard-deadline/withDeadline wrapper on top of it: unlike reminders' fan-out
// across every clinic with no shared per-item cap, this batch's total worst
// case is already bounded below the platform limit by the constants above —
// there's no unbounded tail this route needs its own additional backstop for.
export const maxDuration = 300;

const LOCK_NAME = "storage-cleanup";
const LOCK_TTL_SECONDS = maxDuration + 30;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const lock = await acquireCronLock(LOCK_NAME, LOCK_TTL_SECONDS);
  if (!lock.proceed) {
    logger.warn("Storage cleanup cron skipped — a previous run is still in progress.");
    return NextResponse.json(
      { ok: true, skipped: true, reason: "previous_run_in_progress" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await sweepPendingStorageCleanup();

    if (!result.serviceRoleConfigured) {
      logger.warn("Storage cleanup sweep skipped — SUPABASE_SERVICE_ROLE_KEY is not set.");
    }

    return NextResponse.json(
      { ok: true, ...result, triggeredAt: new Date().toISOString() },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("Storage cleanup sweep failed.", error);

    return NextResponse.json(
      { ok: false, error: "Storage cleanup sweep failed." },
      { status: 500 }
    );
  } finally {
    await releaseCronLock(LOCK_NAME, lock.token);
  }
}
