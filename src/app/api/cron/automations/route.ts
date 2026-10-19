import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { withCronMonitor } from "@/lib/cron-monitor";
import { dispatchDueAutomaticDrafts } from "@/lib/follow-up-dispatch";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
// The sends stop being started after SEND_BUDGET_MS; one already started can
// still take the WhatsApp worker's ~25s timeout, which this leaves room for.
export const maxDuration = 120;

const LOCK_NAME = "automations";
const SEND_BUDGET_MS = 60_000;
// A run the platform kills never reaches the `finally` below, so the TTL frees
// its lock; the margin keeps the next 5-minute trigger from overlapping it.
const LOCK_TTL_SECONDS = maxDuration + 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  return withCronMonitor("/api/cron/automations", run);
}

/**
 * Sends the automations a clinic set to "automatically" whose draft is due —
 * the safety net behind the send each triggering request makes right away
 * (`after()`), and the sender for drafts the hourly follow-ups job makes
 * (thank-yous, payment reminders and the rest). Counts only in the response.
 */
async function run() {
  // Two overlapping runs would both read the same draft as due; the claim
  // already refuses the second, but the lock spares the wasted work.
  const lock = await acquireCronLock(LOCK_NAME, LOCK_TTL_SECONDS);
  if (!lock.proceed) {
    logger.warn("Automations cron skipped — a previous run is still in progress.");
    return NextResponse.json(
      { ok: true, skipped: true, reason: "previous_run_in_progress" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await dispatchDueAutomaticDrafts({ now: new Date(), deadlineAt: Date.now() + SEND_BUDGET_MS });
    if (result.failed > 0) {
      logger.warn("Automations cron completed with unsent messages.", { ...result });
    }
    // Read by withCronMonitor: a run where nothing that was due could be sent
    // (the worker down, every send refused) fails its Sentry check-in.
    return NextResponse.json(
      { ok: true, ...result, degraded: result.failed > 0 && result.sent === 0 },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error("Automations cron failed.", error);
    return NextResponse.json({ ok: false, error: "Automatic sends failed." }, { status: 500 });
  } finally {
    await releaseCronLock(LOCK_NAME, lock.token);
  }
}
