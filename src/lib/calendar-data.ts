import { prisma } from "@/lib/prisma";
import { monthGridRange, type CalendarRange } from "@/lib/calendar-range";
import {
  expandScheduleBlocks,
  toCalendarAppointment,
  type CalendarAppointment,
  type CalendarScheduleBlock,
} from "@/lib/calendar";
import { getZonedDayWindowFromParts, zonedDateTimeToUtc } from "@/lib/time-zone";

// Defensive bound on one month grid (at most six weeks). It sits far above any
// real clinic — ~70 visits a day for 42 days — so it only guards a runaway
// query from shipping an unbounded payload.
const MONTH_ROW_CAP = 3000;
// Schedule blocks (closures, lunch breaks) are a handful per clinic; the cap
// keeps a runaway set from being read, expanded and shipped whole.
const MONTH_BLOCK_CAP = 200;

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);

  return { year, month, day };
}

/**
 * Every appointment (all statuses — completed visits included) and schedule
 * block that touches one month's Monday-to-Sunday grid. Loading a month at a
 * time keeps the payload bounded however long the clinic's history is, while
 * the calendar can still reach any month by asking for it. Returns null for an
 * invalid month key.
 */
export async function loadCalendarMonthRecords(args: { businessId: string; monthKey: string }) {
  const range = monthGridRange(args.monthKey);

  if (!range) {
    return null;
  }

  const first = parseDateKey(range.from);
  const last = parseDateKey(range.to);
  const start = zonedDateTimeToUtc(first);
  const end = getZonedDayWindowFromParts(last.year, last.month, last.day).end;

  const [appointments, scheduleBlocks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        businessId: args.businessId,
        startAt: { gte: start, lte: end },
      },
      include: {
        client: { select: { id: true, name: true } },
        staffMember: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "asc" },
      take: MONTH_ROW_CAP,
    }),
    prisma.scheduleBlock.findMany({
      where: {
        businessId: args.businessId,
        // Interval overlap, not "starts inside the range" — a multi-day block
        // that began before the grid but runs into it must still show.
        startsAt: { lte: end },
        endsAt: { gte: start },
      },
      orderBy: { startsAt: "asc" },
      take: MONTH_BLOCK_CAP,
    }),
  ]);

  return { range, rangeStart: start, rangeEnd: end, appointments, scheduleBlocks };
}

export type CalendarMonthData = {
  range: CalendarRange;
  appointments: CalendarAppointment[];
  scheduleBlocks: CalendarScheduleBlock[];
};

/** The same month, already shaped for the client (used by the on-demand loader). */
export async function loadCalendarMonth(args: {
  businessId: string;
  monthKey: string;
  ownerName: string;
}): Promise<CalendarMonthData | null> {
  const records = await loadCalendarMonthRecords(args);

  if (!records) {
    return null;
  }

  return {
    range: records.range,
    appointments: records.appointments.map((appointment) =>
      toCalendarAppointment(appointment, args.ownerName)
    ),
    scheduleBlocks: expandScheduleBlocks(records.scheduleBlocks, {
      start: records.rangeStart,
      end: records.rangeEnd,
    }),
  };
}
