import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { QUERY_RESERVE_MS, withDeadline } from "@/lib/deadline";
import { logger } from "@/lib/logger";
import {
  REMINDER_RUN_BUDGET_MS,
  syncAppointmentRemindersJob,
  type ReminderProgress,
} from "@/lib/reminders";
import { autoCloseStaleTimeEntries } from "@/lib/staff-clock";

export const dynamic = "force-dynamic";
// Reminders fan out across all WhatsApp-enabled clinics with external sends per
// appointment; give the batch room beyond the platform default.
// NOTE: a ceiling request, not a guarantee — Vercel clamps it to the plan cap
// (Hobby: 60s). The run self-limits via REMINDER_RUN_BUDGET_MS in lib/reminders.ts.
export const maxDuration = 300;

// Hard backstop, later than the interior budgets and below the platform cap:
// a missed interior guard costs completeness, never the response.
const HARD_RESPONSE_DEADLINE_MS = 55_000;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  // Captured at route entry so the reminder job and the sweep share one clock.
  const routeDeadlineAt = Date.now() + REMINDER_RUN_BUDGET_MS;

  const hardDeadlineAt = Date.now() + HARD_RESPONSE_DEADLINE_MS;

  // Mutated as tenants settle, so a hard timeout reports what the run actually
  // reached. Reporting zeros would suppress the caller's capacity warning,
  // which only fires on skippedBusinesses > 0.
  const progress: ReminderProgress = {
    total: 0,
    finished: 0,
    skipped: 0,
    errored: 0,
  };

  try {
    // The losing promise cannot be cancelled (Prisma calls have no abort
    // handle), so on timeout the job may still be running when we respond.
    // That is strictly better than being killed: the same work is lost either
    // way, but the caller learns the run was truncated. Sends are already kept
    // away from this window by SEND_RESERVE_MS.
    const result = await withDeadline(
      syncAppointmentRemindersJob(progress),
      hardDeadlineAt,
      () => ({
        processedBusinesses: progress.total,
        // Tenants never reached PLUS those that finished truncated: both left
        // reminders unsent, and zeros here would hide the whole timeout.
        skippedBusinesses: Math.max(
          0,
          progress.total - progress.finished + progress.skipped
        ),
        erroredBusinesses: progress.errored,
        sent: 0,
        failed: 0,
        timedOut: true as const,
      })
    );

    // Close forgotten open check-ins so weekly hours don't inflate. Best-effort:
    // a sweep fault must not fail the reminders run.
    //
    // Skipped when the reminder job has consumed the budget: this sweep is
    // global and unbounded, and hours self-correct on the next run, whereas a
    // kill here costs the caller the entire response.
    let closedTimeEntries = 0;
    let staleSweepSkipped = false;
    let staleSweepIncomplete = false;

    if (
      "timedOut" in result ||
      routeDeadlineAt - Date.now() < QUERY_RESERVE_MS
    ) {
      staleSweepSkipped = true;
      logger.warn(
        "Skipped the stale time-entry sweep — reminder run consumed the route budget."
      );
    } else {
      try {
        // The deadline is passed in, not just checked before starting: the
        // sweep reads up to 1,000 entries and issues one sequential updateMany
        // per close boundary, so gating only its start still let it overrun.
        ({ closed: closedTimeEntries, incomplete: staleSweepIncomplete } =
          await autoCloseStaleTimeEntries(undefined, new Date(), routeDeadlineAt));
        if (staleSweepIncomplete) {
          logger.warn(
            "Stale time-entry sweep stopped early on the route deadline; remaining entries close next run."
          );
        }
      } catch (error) {
        // A fault leaves entries open just as surely as a truncated run. Without
        // this the response would advertise a sweep that was neither skipped nor
        // incomplete, and monitoring would read a database fault as success.
        staleSweepIncomplete = true;
        logger.error("Auto-close stale time entries failed.", error);
      }
    }

    // A per-message failure (bad number, provider refusal) leaves the run
    // otherwise clean: HTTP 200, nothing skipped, nothing errored. Reported
    // HERE rather than only in the caller so the signal survives whatever
    // triggers the cron — a patient not getting a reminder must not be
    // invisible just because the scheduler changed.
    if (result.failed > 0) {
      logger.warn("Reminder deliveries failed this run.", {
        failed: result.failed,
        sent: result.sent,
        processedBusinesses: result.processedBusinesses,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        processedBusinesses: result.processedBusinesses,
        skippedBusinesses: result.skippedBusinesses,
        erroredBusinesses: result.erroredBusinesses,
        sent: result.sent,
        failed: result.failed,
        closedTimeEntries,
        timedOut: "timedOut" in result,
        staleSweepSkipped,
        staleSweepIncomplete,
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
  }
}
