import {
  differenceInMinutes,
  format,
} from "date-fns";
import type { Appointment, Client, StaffMember } from "@prisma/client";

export type CalendarAppointmentStatus = "confirmed" | "pending" | "cancelled";
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

export type CalendarSelectOption = {
  id: string;
  name: string;
};

export type CalendarViewModel = {
  initialDate: string;
  appointments: CalendarAppointment[];
  clients: CalendarSelectOption[];
  staffMembers: CalendarSelectOption[];
};

type AppointmentWithRelations = Appointment & {
  client: Pick<Client, "id" | "name">;
  staffMember: Pick<StaffMember, "id" | "name"> | null;
};

function toCalendarStatus(status: Appointment["status"]): CalendarAppointmentStatus {
  if (status === "CANCELLED") {
    return "cancelled";
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

  if (status === "PENDING") {
    return "secondary";
  }

  return "primary";
}

export function toPrismaAppointmentStatus(status: CalendarAppointmentStatus) {
  if (status === "cancelled") {
    return "CANCELLED" as const;
  }

  if (status === "pending") {
    return "PENDING" as const;
  }

  return "CONFIRMED" as const;
}

export function buildCalendarViewFromRecords(args: {
  appointments: AppointmentWithRelations[];
  clients: Pick<Client, "id" | "name">[];
  staffMembers: Pick<StaffMember, "id" | "name">[];
  ownerName: string;
  initialDate?: string;
}): CalendarViewModel {
  const { appointments, clients, staffMembers, ownerName, initialDate } = args;
  const initialDateValue = initialDate ?? format(appointments[0]?.startAt ?? new Date(), "yyyy-MM-dd");

  return {
    initialDate: initialDateValue,
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      clientId: appointment.clientId,
      clientName: appointment.client.name,
      service: appointment.title,
      staffMemberId: appointment.staffMemberId ?? undefined,
      staffName: appointment.staffMember?.name ?? ownerName,
      date: format(appointment.startAt, "yyyy-MM-dd"),
      startTime: format(appointment.startAt, "HH:mm"),
      endTime: format(appointment.endAt, "HH:mm"),
      notes: appointment.notes ?? "",
      status: toCalendarStatus(appointment.status),
      tone: toCalendarTone(appointment.status),
    })),
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
    })),
    staffMembers: staffMembers.map((member) => ({
      id: member.id,
      name: member.name,
    })),
  };
}

export function appointmentDurationMinutes(appointment: Pick<Appointment, "startAt" | "endAt">) {
  return Math.max(differenceInMinutes(appointment.endAt, appointment.startAt), 0);
}
