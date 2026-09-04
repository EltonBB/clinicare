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
  block: Pick<ScheduleBlock, "id" | "title" | "startsAt" | "endsAt" | "reason">
): CalendarScheduleBlock[] {
  // For a same-day block (the common case) this is 0 and the loop below
  // produces exactly one entry, first === last day, with the real start/end
  // times — no separate same-day branch needed.
  const dayCount = zonedCalendarDaysBetween(block.startsAt, block.endsAt);
  const startParts = getZonedDateParts(block.startsAt);

  return Array.from({ length: dayCount + 1 }, (_, index) => {
    const dayParts = addZonedDays(startParts, index);
    const isFirstDay = index === 0;
    const isLastDay = index === dayCount;

    return {
      id: block.id,
      title: block.title,
      date: `${dayParts.year}-${String(dayParts.month).padStart(2, "0")}-${String(dayParts.day).padStart(2, "0")}`,
      startTime: isFirstDay ? formatZonedTime24(block.startsAt) : "00:00",
      endTime: isLastDay ? formatZonedTime24(block.endsAt) : "23:59",
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
  } = args;
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
    scheduleBlocks: scheduleBlocks.flatMap((block) => expandScheduleBlockDays(block)),
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
