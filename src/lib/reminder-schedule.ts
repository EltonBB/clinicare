import { addHours, isAfter } from "date-fns";

export type ReminderType = "TWO_HOUR" | "TWENTY_FOUR_HOUR" | "HIGH_RISK";

export type ReminderDecisionArgs = {
  startsAt: Date;
  now: Date;
  send24HourReminder: boolean;
  send2HourReminder: boolean;
  firstReminderHours: number;
  secondReminderHours: number;
  /** Reminder types already recorded as sent for this appointment. */
  sentTypes: Set<string>;
  /**
   * The extra reminder for a visit scored high no-show risk (Pro). It sits
   * between the second and the first reminder: the second still wins when both
   * windows are open, and once it has gone out the first reminder is never sent
   * after it (the same "never a longer lead after a shorter one" rule).
   */
  highRisk?: { enabled: boolean; hours: number; isHighRisk: boolean };
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
 * enough to land inside its window — `vercel.json` runs this every 5 minutes
 * (Vercel Pro; Hobby caps crons at once/day, which is why this used to be
 * broken), so a reminder lands within ~5 minutes of its configured time.
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
    highRisk,
  } = args;

  if (!isAfter(startsAt, now)) {
    return null;
  }

  // In order of precedence when two have the same lead: the second reminder,
  // then the high-risk one, then the first.
  const reminders: Array<{ type: ReminderType; on: boolean; hours: number }> = [
    { type: "TWO_HOUR", on: send2HourReminder, hours: secondReminderHours },
    {
      type: "HIGH_RISK",
      on: Boolean(highRisk?.enabled && highRisk.isHighRisk),
      hours: highRisk?.hours ?? 0,
    },
    { type: "TWENTY_FOUR_HOUR", on: send24HourReminder, hours: firstReminderHours },
  ];
  // The shortest lead among the reminders already sent: anything with a lead
  // at least that long would now arrive after a more urgent one — backwards.
  const shortestSentLead = Math.min(
    ...reminders.filter((reminder) => sentTypes.has(reminder.type)).map((reminder) => reminder.hours)
  );

  const due = reminders.filter(
    (reminder) =>
      reminder.on &&
      !sentTypes.has(reminder.type) &&
      reminder.hours < shortestSentLead &&
      !isAfter(startsAt, addHours(now, reminder.hours))
  );
  if (due.length === 0) {
    return null;
  }

  // Several windows open at once (a late booking, a run that hasn't reached it
  // yet): send only the most urgent; the longer ones are then backwards too.
  return due.reduce((most, reminder) => (reminder.hours < most.hours ? reminder : most)).type;
}
