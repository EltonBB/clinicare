import type { Prisma } from "@prisma/client";

import { timeToMinutes } from "@/lib/calendar";
import { formatZonedTime24, getZonedWallClockMinutesBetween, getZonedWeekday } from "@/lib/time-zone";

/**
 * The clinic's weekly working hours (Settings > Working hours): one row per
 * weekday, Monday = 0. This is the one definition of "inside the hours", used
 * by the calendar's save and by every waiting-list slot-offer path (drafting an
 * offer, sending it, booking it), so a slot is never promised to a patient that
 * the booking form would then refuse (Codex #130).
 */

export type OperatingHoursRow = { isOpen: boolean; startTime: string; endTime: string };

type HoursReader = Pick<Prisma.TransactionClient, "businessHours">;

/**
 * The schedule's weekday (Monday = 0) of the clinic-zone day an instant falls
 * on. The zone's own weekday is Sunday = 0, so it is remapped; going through
 * the zone first is what makes a near-midnight booking resolve to the right
 * day's hours.
 */
export function operatingWeekday(instant: Date): number {
  return (getZonedWeekday(instant) + 6) % 7;
}

/**
 * Whether a booking spanning [startMinutes, endMinutes] (minutes since midnight
 * on the clinic's wall clock) fits one day's hours. No configured row for the
 * weekday means closed, not a guessed Mon-Fri 9-5 default — the same rule as
 * calendar-workspace.tsx, reports.ts and the booking form's businessHoursForDate.
 */
export function fitsOperatingHours(
  hours: OperatingHoursRow | null | undefined,
  startMinutes: number,
  endMinutes: number
): boolean {
  if (!hours?.isOpen) {
    return false;
  }

  return startMinutes >= timeToMinutes(hours.startTime) && endMinutes <= timeToMinutes(hours.endTime);
}

function readHours(db: HoursReader, businessId: string, startAt: Date) {
  return db.businessHours.findUnique({
    where: { businessId_weekday: { businessId, weekday: operatingWeekday(startAt) } },
    select: { isOpen: true, startTime: true, endTime: true },
  });
}

/** The calendar save's check: a booking given as a start instant plus "HH:mm" wall-clock start and end. */
export async function isInsideOperatingHours(
  db: HoursReader,
  args: { businessId: string; startAt: Date; startTime: string; endTime: string }
): Promise<boolean> {
  const hours = await readHours(db, args.businessId, args.startAt);

  return fitsOperatingHours(hours, timeToMinutes(args.startTime), timeToMinutes(args.endTime));
}

/**
 * The same check for a slot given as instants (a freed appointment). The end is
 * the wall-clock start plus the slot's length on the clinic's clock - exactly what
 * Book pre-fills into the booking form (a time and a duration), so this agrees
 * with what the save will then accept, including across a clock change, where the
 * wall-clock length is not the elapsed one (see getZonedWallClockMinutesBetween).
 */
export async function isSlotInsideOperatingHours(
  db: HoursReader,
  args: { businessId: string; startAt: Date; endAt: Date }
): Promise<boolean> {
  const hours = await readHours(db, args.businessId, args.startAt);
  const startMinutes = timeToMinutes(formatZonedTime24(args.startAt));
  const lengthMinutes = getZonedWallClockMinutesBetween(args.startAt, args.endAt);

  return fitsOperatingHours(hours, startMinutes, startMinutes + lengthMinutes);
}
