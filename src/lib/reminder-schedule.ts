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
 *    `sentTypes`.
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
    !isAfter(startsAt, addHours(now, firstReminderHours))
  ) {
    return "TWENTY_FOUR_HOUR";
  }

  return null;
}
