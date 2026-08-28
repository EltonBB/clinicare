import { NextResponse } from "next/server";

import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import {
  createReminderRunProgress,
  REMINDER_RUN_BUDGET_MS,
  syncAppointmentRemindersJob,
} from "@/lib/reminders";
import { autoCloseStaleTimeEntries } from "@/lib/staff-clock";

export const dynamic = "force-dynamic";
// Reminders fan out across all WhatsApp-enabled clinics with external sends per
// appointment; give the batch room beyond the platform default.
export const maxDuration = 300;

// Runs hourly now (vercel.json) so a business skipped here is retried within
// the hour, not the next day — see reminder-schedule.ts for why sub-daily
// matters: a 2-hour-before reminder only ever fires if the cron lands inside
// that window.
const LOCK_NAME = "reminders";

// Comfortably under the 300s platform cap, covering the reminders job AND the
// stale-entry sweep after it, so a genuine hang still returns a response
// instead of being silently killed. This is a backstop for the rare case the
// job's own internal budget check doesn't reach (e.g. one query hanging
// mid-business) — normal runs finish in seconds and never touch it.
const HARD_RESPONSE_DEADLINE_MS = 270_000;

// Derived from the hard deadline, not an independent number: if that backstop
// fires, the losing work is left running (Prisma calls have no abort handle)
// and could still be writing for a little longer. The TTL — not the `finally`
// release — is what actually protects a crashed or killed invocation; the 60s
// margin just gives the abandoned work room to finish before the next hourly
// trigger could contend with it. Tying it to HARD_RESPONSE_DEADLINE_MS means
// the two can't silently drift apart if one is ever changed alone.
const LOCK_TTL_SECONDS = Math.ceil(HARD_RESPONSE_DEADLINE_MS / 1_000) + 60;

const TIMED_OUT: unique symbol = Symbol("reminders-cron-timed-out");

// Two type parameters, not one: the success and timeout branches here return
// differently-shaped objects (`timedOut: false` vs `timedOut: true` as
// literals), and forcing both through a single T made the timeout branch a
// type error — TS unified T from the first argument, then rejected the
// second as not assignable to it.
async function withHardDeadline<T, F>(
  work: Promise<T>,
  onTimeout: () => F
): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), HARD_RESPONSE_DEADLINE_MS);
  });

  try {
    const result = await Promise.race([work, timeout]);
    if (result === TIMED_OUT) {
      void work.catch(() => {});
      return onTimeout();
    }
    return result as T;
  } finally {
    // clearTimeout accepts undefined as a no-op — no guard needed.
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  // Vercel Cron does not serialize invocations — a slow run can still be in
  // flight when the next hourly trigger fires. Without this, an overlapping
  // run could read the same due appointment before either has written its
  // SENT marker and send the reminder twice.
  const gotLock = await acquireCronLock(LOCK_NAME, LOCK_TTL_SECONDS);
  if (!gotLock) {
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
    const outcome = await withHardDeadline(
      (async () => {
        const result = await syncAppointmentRemindersJob(
          Date.now() + REMINDER_RUN_BUDGET_MS,
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

        return { ...result, closedTimeEntries, timedOut: false as const };
      })(),
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
          closedTimeEntries: 0,
          timedOut: true as const,
        };
      }
    );

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
    // Deliberately NOT released on a timeout: the abandoned job may still be
    // writing (Prisma calls have no abort handle), and releasing here would
    // defeat the longer TTL above — a manual re-trigger could then overlap
    // that still-running work. The TTL is what actually protects this case;
    // an early release only happens on a genuine completion (success or a
    // caught error), where nothing is left running behind it.
    if (!timedOut) {
      await releaseCronLock(LOCK_NAME);
    }
  }
}
