import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { generateFollowUpDrafts } from "@/lib/follow-up-generation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
// The job stops starting new businesses after its own 90s budget, and no one
// business may run past it (see follow-up-generation.ts), leaving headroom for
// the stale-draft sweep.
export const maxDuration = 120;

const LOCK_NAME = "follow-ups";
// Derived from maxDuration so the two can't drift apart: a run the platform
// kills at maxDuration never reaches the `finally` below, so the TTL — not the
// release — is what frees its lock, and the margin keeps the next hourly
// trigger from overlapping a still-running straggler.
const LOCK_TTL_SECONDS = maxDuration + 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  // Vercel Cron does not serialize invocations; without the lock two runs could
  // both read the same client as needing a draft.
  const lock = await acquireCronLock(LOCK_NAME, LOCK_TTL_SECONDS);
  if (!lock.proceed) {
    logger.warn("Follow-up cron skipped — a previous run is still in progress.");
    return NextResponse.json(
      { ok: true, skipped: true, reason: "previous_run_in_progress" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Set when a business was abandoned to its per-business timeout: its database
  // work cannot be cancelled and may still be writing, so the `finally` below
  // must not release the lock out from under it.
  let holdLock = false;

  try {
    const result = await generateFollowUpDrafts();
    holdLock = result.abandonedBusinesses > 0;

    if (result.errors > 0) {
      logger.warn("Follow-up cron completed with errors.", { ...result });
    }

    if (holdLock) {
      logger.warn(
        "Follow-up cron abandoned business(es) to their per-business timeout — keeping the cron lock held until its TTL as a precaution.",
        { abandonedBusinesses: result.abandonedBusinesses }
      );
    }

    // Counts only — never client names or draft text.
    return NextResponse.json({ ok: true, ...result }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("Follow-up cron failed.", error);

    return NextResponse.json({ ok: false, error: "Follow-up draft generation failed." }, { status: 500 });
  } finally {
    // Same reasoning as the reminders cron: an early release only happens when
    // nothing was left running behind it. The TTL frees an abandoned run's lock
    // well before the next hourly trigger.
    if (!holdLock) {
      await releaseCronLock(LOCK_NAME, lock.token);
    }
  }
}
