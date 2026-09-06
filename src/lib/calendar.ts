import { differenceInMinutes } from "date-fns";
import type { Appointment, BusinessHours, Client, ScheduleBlock, StaffMember } from "@prisma/client";

import {
  addZonedDays,
  formatZonedDateKey,
  formatZonedTime24,
  getAppTimeZone,
  getZonedDateParts,
  zonedCalendarDaysBetween,
} from "@/lib/time-zone";

export type CalendarAppointmentStatus = "confirmed" | "pending" | "cancelled" | "completed";
export type CalendarAppointmentTone = "primary" | "secondary" | "muted";

export type CalendarAppointment = {
  id: string;
  clientId: string;
  clientName: string;
  service: string;
  staffMemberId?: string;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  status: CalendarAppointmentStatus;
  tone: CalendarAppointmentTone;
};

export type CalendarScheduleBlock = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
};

export type CalendarSelectOption = {
  id: string;
  name: string;
  phone?: string;
};

export type CalendarBusinessHours = {
  weekday: number;
  enabled: boolean;
  start: string;
  end: string;
};

export type CalendarViewModel = {
  initialDate: string;
  timeZoneLabel: string;
  appointments: CalendarAppointment[];
  scheduleBlocks: CalendarScheduleBlock[];
  // Booking/edit forms need the picker list; the calendar grid only needs to
  // know whether any client exists (to gate the booking CTA). The grid surface
  // passes `hasClients` so it never loads the whole client table just to render.
  clients: CalendarSelectOption[];
  hasClients: boolean;
  staffMembers: CalendarSelectOption[];
  businessHours: CalendarBusinessHours[];
};

function getTimeZoneLabel() {
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        timeZone: getAppTimeZone(),
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? "GMT"
    );
  } catch {
    return "GMT";
  }
}

type AppointmentWithRelations = Appointment & {
  client: Pick<Client, "id" | "name">;
  staffMember: Pick<StaffMember, "id" | "name"> | null;
};

type ScheduleBlockWithRelations = ScheduleBlock;

function toCalendarStatus(status: Appointment["status"]): CalendarAppointmentStatus {
  if (status === "CANCELLED") {
    return "cancelled";
  }

  if (status === "COMPLETED") {
    return "completed";
  }

  if (status === "PENDING") {
    return "pending";
  }

  return "confirmed";
}

function toCalendarTone(status: Appointment["status"]): CalendarAppointmentTone {
  if (status === "CANCELLED") {
    return "muted";
  }

  if (status === "COMPLETED") {
    return "primary";
  }

  if (status === "PENDING") {
    return "secondary";
  }

  return "primary";
}

export function toPrismaAppointmentStatus(status: CalendarAppointmentStatus) {
  if (status === "cancelled") {
    return "CANCELLED" as const;
  }

  if (status === "completed") {
    return "COMPLETED" as const;
  }

  if (status === "pending") {
    return "PENDING" as const;
  }

  return "CONFIRMED" as const;
}

// A single {date, startTime, endTime} entry can't represent a block that
// spans multiple calendar days (e.g. a multi-day holiday closure) — every
// consumer (capacity math, the day-grid block card) keys off one `date`, so
// a multi-day block needs one entry per day it touches, each clamped to that
// day's portion, or every day after the first silently loses the block.
function expandScheduleBlockDays(
  block: Pick<ScheduleBlock, "id" | "title" | "startsAt" | "endsAt" | "reason">,
  range?: { start: Date; end: Date }
): CalendarScheduleBlock[] {
  // For a same-day block (the common case) this is 0 and the loop below
  // produces exactly one entry, first === last day, with the real start/end
  // times — no separate same-day branch needed.
  const rawDayCount = zonedCalendarDaysBetween(block.startsAt, block.endsAt);
  const endsAtMidnight = formatZonedTime24(block.endsAt) === "00:00";
  // An end of exactly midnight is the normal end-exclusive way to represent
  // "blocked through the end of the previous day" — that instant belongs to
  // the next calendar day but blocks none of it. Without this, the loop
  // below emitted an extra {date: nextDay, startTime: "00:00", endTime:
  // "00:00"} entry for it: a zero-duration segment BlockCard still renders
  // (its minimum height applies regardless of duration) and the month
  // view/day rail still list, falsely marking a fully open day as blocked
  // (Codex P2).
  const dayCount = endsAtMidnight && rawDayCount > 0 ? rawDayCount - 1 : rawDayCount;
  const startParts = getZonedDateParts(block.startsAt);

  // Clamp emission to the fetched calendar range — the query above now
  // correctly fetches a block that started long before the visible window
  // (interval overlap, not "starts inside range"), but without this, a
  // years-old closure still expanded one entry per day from its ACTUAL
  // start: thousands of off-screen entries no view can ever display,
  // serialized in the RSC payload and scanned by the client for nothing
  // (Codex P2). isFirstDay/isLastDay below still key off the unclamped
  // index, so a clamped-in day correctly renders as a full 00:00–23:59
  // continuation, never the block's true (possibly ancient) start/end time.
  const minIndex = range
    ? Math.max(0, zonedCalendarDaysBetween(block.startsAt, range.start))
    : 0;
  const maxIndex = range
    ? Math.min(dayCount, zonedCalendarDaysBetween(block.startsAt, range.end))
    : dayCount;

  if (minIndex > maxIndex) {
    return [];
  }

  return Array.from({ length: maxIndex - minIndex + 1 }, (_, offset) => {
    const index = minIndex + offset;
    const dayParts = addZonedDays(startParts, index);
    const isFirstDay = index === 0;
    const isLastDay = index === dayCount;

    return {
      id: block.id,
      title: block.title,
      date: `${dayParts.year}-${String(dayParts.month).padStart(2, "0")}-${String(dayParts.day).padStart(2, "0")}`,
      startTime: isFirstDay ? formatZonedTime24(block.startsAt) : "00:00",
      // The dropped terminal day above means the new last day's own nominal
      // end is midnight too whenever endsAtMidnight — but that day is genuinely
      // blocked through its close, so render "23:59" (same as any other
      // non-final continuation day), not the literal (misleading) "00:00".
      endTime: isLastDay ? (endsAtMidnight ? "23:59" : formatZonedTime24(block.endsAt)) : "23:59",
      notes: block.reason ?? "",
    };
  });
}

export function buildCalendarViewFromRecords(args: {
  appointments: AppointmentWithRelations[];
  scheduleBlocks?: ScheduleBlockWithRelations[];
  // Provide `clients` for the booking/edit pickers, or just `hasClients` for the
  // calendar grid (which only gates the booking CTA and shouldn't load the table).
  clients?: Pick<Client, "id" | "name" | "phone">[];
  hasClients?: boolean;
  staffMembers: Pick<StaffMember, "id" | "name">[];
  businessHours: Pick<BusinessHours, "weekday" | "isOpen" | "startTime" | "endTime">[];
  ownerName: string;
  initialDate?: string;
  /** The fetched calendar window, so a schedule block starting well before it
   * doesn't expand into thousands of off-screen day entries — see
   * expandScheduleBlockDays. Omit only when scheduleBlocks is empty/absent. */
  rangeStart?: Date;
  rangeEnd?: Date;
}): CalendarViewModel {
  const {
    appointments,
    scheduleBlocks = [],
    clients = [],
    hasClients,
    staffMembers,
    businessHours,
    ownerName,
    initialDate,
    rangeStart,
    rangeEnd,
  } = args;
  const expandRange = rangeStart && rangeEnd ? { start: rangeStart, end: rangeEnd } : undefined;
  const clientOptions = clients.map((client) => ({
    id: client.id,
    name: client.name,
    phone: client.phone ?? undefined,
  }));
  const initialDateValue =
    initialDate ?? formatZonedDateKey(appointments[0]?.startAt ?? new Date());

  return {
    initialDate: initialDateValue,
    timeZoneLabel: getTimeZoneLabel(),
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      clientId: appointment.clientId,
      clientName: appointment.client.name,
      service: appointment.title,
      staffMemberId: appointment.staffMemberId ?? undefined,
      staffName: appointment.staffMember?.name ?? ownerName,
      date: formatZonedDateKey(appointment.startAt),
      startTime: formatZonedTime24(appointment.startAt),
      endTime: formatZonedTime24(appointment.endAt),
      notes: appointment.notes ?? "",
      status: toCalendarStatus(appointment.status),
      tone: toCalendarTone(appointment.status),
    })),
    scheduleBlocks: scheduleBlocks.flatMap((block) => expandScheduleBlockDays(block, expandRange)),
    clients: clientOptions,
    hasClients: hasClients ?? clientOptions.length > 0,
    staffMembers: staffMembers.map((member) => ({
      id: member.id,
      name: member.name,
    })),
    businessHours: businessHours.map((item) => ({
      weekday: item.weekday,
      enabled: item.isOpen,
      start: item.startTime,
      end: item.endTime,
    })),
  };
}

export function appointmentDurationMinutes(appointment: Pick<Appointment, "startAt" | "endAt">) {
  return Math.max(differenceInMinutes(appointment.endAt, appointment.startAt), 0);
}
