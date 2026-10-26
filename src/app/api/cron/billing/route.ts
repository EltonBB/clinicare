import { NextResponse } from "next/server";

import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { withCronMonitor } from "@/lib/cron-monitor";
import { logger } from "@/lib/logger";
import { paddleConfig } from "@/lib/paddle/paddle-config";
import { reconcileOverdueSubscriptions } from "@/lib/paddle/reconcile";

export const dynamic = "force-dynamic";
// RECONCILE_BATCH (25) Paddle calls, each capped at 10s: 250s worst case.
export const maxDuration = 300;

const LOCK_NAME = "billing-reconcile";
const LOCK_TTL_SECONDS = maxDuration + 30;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  return withCronMonitor("/api/cron/billing", run);
}

async function run() {
  const config = paddleConfig();
  if (!config) {
    // Billing isn't switched on in this environment: nothing to reconcile.
    return NextResponse.json({ ok: true, skipped: true, reason: "billing_not_configured" }, { headers: { "Cache-Control": "no-store" } });
  }

  const lock = await acquireCronLock(LOCK_NAME, LOCK_TTL_SECONDS);
  if (!lock.proceed) {
    logger.warn("Billing reconcile skipped — a previous run is still in progress.");
    return NextResponse.json(
      { ok: true, skipped: true, reason: "previous_run_in_progress" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await reconcileOverdueSubscriptions(config);
    return NextResponse.json(
      // A failed Paddle call fails the check-in (withCronMonitor reads `degraded`).
      { ok: true, ...result, degraded: result.failed > 0, triggeredAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("Billing reconcile failed.", error);
    return NextResponse.json({ ok: false, error: "Billing reconcile failed." }, { status: 500 });
  } finally {
    await releaseCronLock(LOCK_NAME, lock.token);
  }
}
