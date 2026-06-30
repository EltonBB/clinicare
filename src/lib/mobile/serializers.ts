import type { Appointment } from "@prisma/client";

import { appointmentDurationMinutes } from "@/lib/calendar";
import type { StaffDirectoryItem } from "@/lib/staff";
import {
  formatZonedFullDate,
  formatZonedShortDate,
  formatZonedTime24,
} from "@/lib/time-zone";

/**
 * Pure serializers that shape main-app records into the exact view models the
 * "Vela Staff" mobile app consumes (see `vela-mobile-app/src/data/types.ts`).
 * The main app owns these `/api/mobile/v1` response shapes; the mobile repo's
 * types are hand-kept in sync. Keep these PURE (no DB / no request) so they are
 * unit-tested without mocks, like the rest of the suite.
 */

// Mirrors mobile `Doctor`.
export type MobileDoctor = {
  id: string;
  name: string;
  role: string;
  clinicName: string;
  email: string;
  phone: string;
  status: "active" | "away";
  checkedIn: boolean;
  shiftLabel: string;
  deviceLabel: string;
  pairedAtLabel: string;
};

// Mirrors mobile `Appointment` / `AppointmentStatus`.
export type MobileAppointmentStatus = "confirmed" | "pending" | "completed" | "cancelled";

export type MobileAppointment = {
  id: string;
  patientName: string;
  service: string;
  startLabel: string;
  endLabel: string;
  startMinutes: number;
  durationMin: number;
  status: MobileAppointmentStatus;
  dayKey: "today" | "tomorrow" | string;
  dateLabel: string;
  notes?: string;
};

export function serializeMe(args: {
  item: Pick<
    StaffDirectoryItem,
    "id" | "name" | "role" | "email" | "phone" | "status" | "isCheckedIn" | "shiftLabel"
  >;
  clinicName: string;
  device: { deviceLabel: string | null; createdAt: Date };
}): MobileDoctor {
  const { item, clinicName, device } = args;
  return {
    id: item.id,
    name: item.name,
    role: item.role,
    clinicName,
    email: item.email,
    phone: item.phone,
    // INACTIVE staff can't authenticate, so only ACTIVE/AWAY reach here.
    status: item.status === "AWAY" ? "away" : "active",
    checkedIn: item.isCheckedIn,
    shiftLabel: item.shiftLabel,
    deviceLabel: device.deviceLabel ?? "This device",
    pairedAtLabel: `Paired ${formatZonedFullDate(device.createdAt)}`,
  };
}

export type AppointmentForMobile = Pick<
  Appointment,
  "id" | "title" | "startAt" | "endAt" | "status" | "notes"
> & { client: { name: string } };

export function serializeAppointment(
  appointment: AppointmentForMobile,
  dayKey: "today" | "tomorrow" | string
): MobileAppointment {
  const startLabel = formatZonedTime24(appointment.startAt);
  const [hours, minutes] = startLabel.split(":").map(Number);

  return {
    id: appointment.id,
    patientName: appointment.client.name,
    service: appointment.title,
    startLabel,
    endLabel: formatZonedTime24(appointment.endAt),
    startMinutes: hours * 60 + minutes,
    durationMin: appointmentDurationMinutes(appointment),
    // The enum values map 1:1 to the mobile lowercase statuses.
    status: appointment.status.toLowerCase() as MobileAppointmentStatus,
    dayKey,
    dateLabel: dateLabelFor(appointment.startAt, dayKey),
    notes: appointment.notes ?? undefined,
  };
}

function dateLabelFor(startAt: Date, dayKey: string): string {
  const shortDate = formatZonedShortDate(startAt);
  if (dayKey === "today") return `Today, ${shortDate}`;
  if (dayKey === "tomorrow") return `Tomorrow, ${shortDate}`;
  return shortDate;
}
