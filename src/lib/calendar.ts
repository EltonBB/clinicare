import { differenceInMinutes } from "date-fns";
import type { Appointment, BusinessHours, Client, ScheduleBlock, StaffMember } from "@prisma/client";

import {
  formatZonedDateKey,
  formatZonedTime24,
  getAppTimeZone,
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
  clients: CalendarSelectOption[];
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

export function buildCalendarViewFromRecords(args: {
  appointments: AppointmentWithRelations[];
  scheduleBlocks?: ScheduleBlockWithRelations[];
  clients: Pick<Client, "id" | "name" | "phone">[];
  staffMembers: Pick<StaffMember, "id" | "name">[];
  businessHours: Pick<BusinessHours, "weekday" | "isOpen" | "startTime" | "endTime">[];
  ownerName: string;
  initialDate?: string;
}): CalendarViewModel {
  const {
    appointments,
    scheduleBlocks = [],
    clients,
    staffMembers,
    businessHours,
    ownerName,
    initialDate,
  } = args;
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
    scheduleBlocks: scheduleBlocks.map((block) => ({
      id: block.id,
      title: block.title,
      date: formatZonedDateKey(block.startsAt),
      startTime: formatZonedTime24(block.startsAt),
      endTime: formatZonedTime24(block.endsAt),
      notes: block.reason ?? "",
    })),
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
      phone: client.phone ?? undefined,
    })),
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
