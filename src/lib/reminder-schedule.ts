import { addHours, isAfter } from "date-fns";

export type ReminderType = "TWO_HOUR" | "TWENTY_FOUR_HOUR";

export type ReminderDecisionArgs = {
  startsAt: Date;
  now: Date;
  send24HourReminder: boolean;
  send2HourReminder: boolean;
  firstReminderHours: number;
  secondReminderHours: number;
  /** Reminder types already recorded as sent for this appointment. */
  sentTypes: Set<string>;
};

/**
 * Decide which reminder (if any) is due for an appointment at `now`.
 *
 * Pure and dependency-free (no Prisma) so it can be unit-tested directly — this
 * is the gate the whole reminder integration sits on. Rules:
 *  - A past appointment is never reminded (`!isAfter(startsAt, now)` → null).
 *  - The 2-hour reminder takes precedence over the 24-hour one when both
 *    windows are open and neither has been sent, so a single cron run never
 *    fires two reminders for the same appointment.
 *  - Each reminder is gated by its own flag and suppressed once its type is in
 *    `sentTypes`. The 24-hour reminder is ALSO suppressed once the 2-hour one
 *    has been sent — not just its own type — otherwise an appointment first
 *    discovered already inside the 2-hour window (a same-day booking, or a run
 *    the cron simply hasn't reached yet) sends TWO_HOUR immediately, and then
 *    a LATER hourly run — TWO_HOUR now in sentTypes, so that branch is
 *    skipped — falls through to TWENTY_FOUR_HOUR, which is still technically
 *    "unsent" and still inside its (much wider) window. That sends the
 *    longer-lead-time reminder AFTER the more urgent one already went out —
 *    backwards, and confusing for a patient whose appointment might be 30
 *    minutes away by then. Under the old once-daily cron this couldn't
 *    happen (an appointment was visited at most once before either its
 *    window closed or the appointment itself passed); hourly runs made it
 *    reachable.
 *  - The window checks use `<=` (via `!isAfter`), so the exact boundary instant
 *    (appointment exactly N hours away) fires.
 *
 * NOTE: the 2-hour ("second") reminder only fires when the cron runs often
 * enough to land inside its window — `vercel.json` runs this hourly (Vercel
 * Pro; Hobby caps crons at once/day, which is why this used to be broken).
 */
export function reminderTypeForAppointment(
  args: ReminderDecisionArgs
): ReminderType | null {
  const {
    startsAt,
    now,
    send24HourReminder,
    send2HourReminder,
    firstReminderHours,
    secondReminderHours,
    sentTypes,
  } = args;

  if (!isAfter(startsAt, now)) {
    return null;
  }

  if (
    send2HourReminder &&
    !sentTypes.has("TWO_HOUR") &&
    !isAfter(startsAt, addHours(now, secondReminderHours))
  ) {
    return "TWO_HOUR";
  }

  if (
    send24HourReminder &&
    !sentTypes.has("TWENTY_FOUR_HOUR") &&
    // Once the more urgent reminder has gone out, the longer-lead-time one
    // is always backwards to send afterward — see the doc comment above.
    !sentTypes.has("TWO_HOUR") &&
    !isAfter(startsAt, addHours(now, firstReminderHours))
  ) {
    return "TWENTY_FOUR_HOUR";
  }

  return null;
}
