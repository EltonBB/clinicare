import { NextResponse } from "next/server";

import { withDeadline } from "@/lib/concurrency";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { withCronMonitor } from "@/lib/cron-monitor";
import { logger } from "@/lib/logger";
import { handOffAbandonedReplyIntents } from "@/lib/messaging/inbound";
import { isWhatsAppWorkerDown } from "@/lib/messaging/worker-heartbeat";
import { createReminderRunProgress, syncAppointmentRemindersJob } from "@/lib/reminders";
import { HARD_RESPONSE_DEADLINE_MS, REMINDER_RUN_BUDGET_MS } from "@/lib/reminder-timing";
import { autoCloseStaleTimeEntries } from "@/lib/staff-clock";

export const dynamic = "force-dynamic";
// Reminders fan out across all WhatsApp-enabled clinics with external sends per
// appointment; give the batch room beyond the platform default.
export const maxDuration = 300;

// Runs every 5 minutes (vercel.json), so a reminder goes out within about 5
// minutes of its "N hours before" time and a business skipped here is retried
// on the next run — see reminder-schedule.ts. Hourly runs sent reminders up to
// 59 minutes late, which read as "the reminder never came" (2026-10-18). A
// worst-case run (HARD_RESPONSE_DEADLINE_MS, 270s) still ends before the next
// trigger; the lock below covers the rest.
const LOCK_NAME = "reminders";

// The worker lease check's own budget, on top of HARD_RESPONSE_DEADLINE_MS.
const WORKER_CHECK_TIMEOUT_MS = 5_000;

// HARD_RESPONSE_DEADLINE_MS itself now lives in lib/reminders.ts — comfortably
// under the 300s platform cap, covering the reminders job AND the stale-entry
// sweep after it, so a genuine hang still returns a response instead of being
// silently killed. It moved there because REMINDER_RUN_BUDGET_MS (the job's
// own internal "stop starting new businesses" threshold) has to be derived
// from it — see that constant's comment in reminders.ts.

// Derived from the hard deadline, not an independent number: if that backstop
// fires, the losing work is left running (Prisma calls have no abort handle)
// and could still be writing for a little longer. The TTL — not the `finally`
// release — is what actually protects a crashed or killed invocation; the 60s
// margin just gives the abandoned work room to finish before the next
// trigger could contend with it (a held lock makes that run skip once). Tying it to HARD_RESPONSE_DEADLINE_MS means
// the two can't silently drift apart if one is ever changed alone.
const LOCK_TTL_SECONDS = Math.ceil(HARD_RESPONSE_DEADLINE_MS / 1_000) + 60;


export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  return withCronMonitor("/api/cron/reminders", run);
}

async function run() {
  // Vercel Cron does not serialize invocations — a slow run can still be in
  // flight when the next trigger fires. Without this, an overlapping
  // run could read the same due appointment before either has written its
  // SENT marker and send the reminder twice.
  const lock = await acquireCronLock(LOCK_NAME, LOCK_TTL_SECONDS);
  if (!lock.proceed) {
    logger.warn("Reminder cron skipped — a previous run is still in progress.");
    return NextResponse.json(
      { ok: true, skipped: true, reason: "previous_run_in_progress" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Mutated live as businesses finish, so a hard timeout below can report what
  // actually happened instead of the zeros a fresh result object would show —
  // with concurrency > 1, other workers can still be sending real reminders
  // when the deadline hits the one that's stuck.
  const progress = createReminderRunProgress();
  let timedOut = false;

  try {
    const startedAt = Date.now();
    const outcome = await withDeadline(
      (async () => {
        // Hand to staff the patient replies whose check was cut off by a crash
        // (see handOffAbandonedReplyIntents) — first, so slow reminder sends
        // can never crowd it out. Best-effort: a fault here must not stop the
        // reminders.
        let handedOffReplies = 0;
        try {
          ({ handedOff: handedOffReplies } = await handOffAbandonedReplyIntents());
        } catch (error) {
          logger.error("Handing abandoned reply checks to staff failed.", error);
        }

        // Budgeted from the invocation's start, not from now: whatever the
        // hand-off above took comes out of the reminders' share (a business
        // left over is retried on the next run), never out of the hard deadline.
        const result = await syncAppointmentRemindersJob(
          startedAt + REMINDER_RUN_BUDGET_MS,
          progress
        );

        // Close forgotten open check-ins so weekly hours don't inflate.
        // Best-effort: a sweep fault must not fail the reminders run.
        //
        // Deliberately uncapped, unlike the reminders job above: at pilot
        // scale it is fast, and the hard deadline below still catches it if
        // it ever isn't — the trade-off is that a slow SWEEP after an
        // otherwise-successful reminders run also reads as `timedOut` in the
        // response. That's acceptable because `sent`/`failed`/`skippedBusinesses`
        // stay accurate regardless (see the progress object) — only the
        // "which phase was slow" distinction is lost, not whether reminders
        // actually went out.
        let closedTimeEntries = 0;
        try {
          ({ closed: closedTimeEntries } = await autoCloseStaleTimeEntries());
        } catch (error) {
          logger.error("Auto-close stale time entries failed.", error);
        }

        return { ...result, closedTimeEntries, handedOffReplies, timedOut: false as const };
      })(),
      HARD_RESPONSE_DEADLINE_MS,
      () => {
        timedOut = true;
        return {
          // From `progress`, not zeros: `total`/`sent`/`failed`/`skipped` carry
          // whatever the still-running job had actually reached at the moment
          // we gave up on it, using the exact same field meanings the normal
          // return path uses (see reminders.ts) — a reader never has to know
          // whether a response came from a timeout to interpret it correctly.
          processedBusinesses: progress.total,
          sent: progress.sent,
          failed: progress.failed,
          skippedBusinesses: progress.skipped,
          abandonedBusinesses: progress.abandoned,
          closedTimeEntries: 0,
          handedOffReplies: 0,
          timedOut: true as const,
        };
      }
    );

    // Sentry can't watch the worker from outside (it refuses *.railway.app
    // monitors), so this run checks the worker's lease instead and
    // fails its check-in when the lease has lapsed. Best-effort, like the
    // sweeps above.
    // Bounded on its own: after a run that hit the hard deadline the pool may
    // still be busy with the abandoned work, and an unbounded read here could
    // outlast maxDuration (the hard deadline plus this stay under it).
    let workerDown = false;
    try {
      const check = await withDeadline(isWhatsAppWorkerDown(), WORKER_CHECK_TIMEOUT_MS, () => null);
      if (check === null) {
        logger.warn("Checking the WhatsApp worker's lease timed out.");
      } else {
        workerDown = check;
      }
    } catch (error) {
      logger.error("Checking the WhatsApp worker's lease failed.", error);
    }

    if (workerDown) {
      logger.error(
        "The WhatsApp worker hasn't renewed its lease in over 5 minutes — messages can't be sent or received until it is running again."
      );
    }

    if (outcome.timedOut) {
      // Worded around "this invocation," not "the reminder run": the slow
      // part could be the reminders job OR the stale-entry sweep after it —
      // `outcome.sent`/`outcome.failed` (from live progress, not zeros) are
      // what tell a reader whether reminders themselves actually went out.
      logger.error(
        "Reminder cron invocation hit its hard deadline — the platform would otherwise have killed it silently.",
        undefined,
        { hardDeadlineMs: HARD_RESPONSE_DEADLINE_MS }
      );
    } else if (outcome.abandonedBusinesses > 0) {
      // Not a hard-deadline timeout — the invocation completed within
      // budget — but at least one business individually exceeded its
      // per-business timeout (see PER_BUSINESS_TIMEOUT_MS in reminders.ts)
      // and may still be running in the background. The `finally` block
      // below keeps the lock held for the same reason a real timeout does.
      logger.error(
        "Reminder run completed, but abandoned business(es) to their per-business timeout — keeping the cron lock held until its TTL as a precaution.",
        undefined,
        { abandonedBusinesses: outcome.abandonedBusinesses }
      );
    } else if (outcome.failed > 0) {
      // Aggregate signal in addition to the per-failure logs in reminders.ts —
      // catches "many small failures across different clinics" at a glance.
      logger.warn("Reminder run completed with undelivered messages.", {
        failed: outcome.failed,
        sent: outcome.sent,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        ...outcome,
        // Read by withCronMonitor: a hard-deadline hit, an abandoned business
        // or a stopped WhatsApp worker is a failed run for Sentry Crons, even
        // though it returns 200.
        workerDown,
        degraded: outcome.timedOut || outcome.abandonedBusinesses > 0 || workerDown,
        triggeredAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    logger.error("Reminder cron job failed.", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Reminder cron job failed.",
      },
      { status: 500 }
    );
  } finally {
    // Deliberately NOT released when this invocation hit its hard deadline
    // OR any business was individually abandoned to its own per-business
    // timeout (reminders.ts) — either way something may still be writing
    // (Prisma calls have no abort handle), and releasing here would defeat
    // the TTL above and let a manual re-trigger overlap that still-running
    // work. `progress` is read directly (not `outcome`, which is out of
    // scope here and wouldn't exist if the try block threw) because it is
    // live-mutated by the job regardless of which path this function took.
    // An early release only happens when NOTHING was left running behind it.
    if (!timedOut && progress.abandoned === 0) {
      await releaseCronLock(LOCK_NAME, lock.token);
    }
  }
}
