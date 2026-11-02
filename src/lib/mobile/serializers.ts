import type { Appointment } from "@prisma/client";

import type { Locale } from "@/i18n/config";
import { fmt, storedLabel } from "@/i18n/format";
import { messages } from "@/i18n/messages";
import { appointmentDurationMinutes } from "@/lib/calendar";
import type { StaffDirectoryItem } from "@/lib/staff";
import {
  formatZonedFullDate,
  formatZonedShortDate,
  formatZonedTime24,
  formatZonedWeekdayShortDate,
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
  /** Whether check-in/out is allowed right now (inside a scheduled shift window,
   *  or already checked in). The app disables the button when false. */
  canClock: boolean;
  /** Why clocking is unavailable (empty when canClock) — shown under the button. */
  clockDisabledReason: string;
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
  /** The appointment's end time has already passed (real time, not status) —
   *  lets clients stop calling a never-marked-completed past visit "next up". */
  hasEnded: boolean;
  dayKey: "today" | "tomorrow" | string;
  dateLabel: string;
  notes?: string;
};

export function serializeMe(args: {
  item: Pick<
    StaffDirectoryItem,
    | "id"
    | "name"
    | "role"
    | "email"
    | "phone"
    | "status"
    | "isCheckedIn"
    | "shiftLabel"
    | "canClock"
    | "clockDisabledReason"
  >;
  clinicName: string;
  device: { deviceLabel: string | null; createdAt: Date };
  locale?: Locale;
}): MobileDoctor {
  const { item, clinicName, device, locale = "en" } = args;
  const t = messages[locale].mobile;
  return {
    id: item.id,
    name: item.name,
    // A built-in role reads in the app's language; a clinic's own stays as typed.
    role: item.role ? storedLabel(messages[locale].staff.roles, item.role) : messages[locale].staff.noRole,
    clinicName,
    email: item.email,
    phone: item.phone,
    // INACTIVE staff can't authenticate, so only ACTIVE/AWAY reach here.
    status: item.status === "AWAY" ? "away" : "active",
    checkedIn: item.isCheckedIn,
    shiftLabel: item.shiftLabel,
    canClock: item.canClock,
    clockDisabledReason: item.clockDisabledReason,
    deviceLabel: device.deviceLabel ?? t.thisDevice,
    pairedAtLabel: fmt(t.paired, { date: formatZonedFullDate(device.createdAt, undefined, locale) }),
  };
}

export type AppointmentForMobile = Pick<
  Appointment,
  "id" | "title" | "startAt" | "endAt" | "status" | "notes"
> & { client: { name: string } };

// The mobile app only knows four statuses. A no-show is a slot that didn't
// happen, so it reads as cancelled there until the app grows its own state.
function toMobileAppointmentStatus(status: AppointmentForMobile["status"]): MobileAppointmentStatus {
  return status === "NO_SHOW" ? "cancelled" : (status.toLowerCase() as MobileAppointmentStatus);
}

export function serializeAppointment(
  appointment: AppointmentForMobile,
  dayKey: "today" | "tomorrow" | string,
  now: Date = new Date(),
  locale: Locale = "en"
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
    status: toMobileAppointmentStatus(appointment.status),
    hasEnded: appointment.endAt.getTime() < now.getTime(),
    dayKey,
    dateLabel: dateLabelFor(appointment.startAt, dayKey, locale),
    notes: appointment.notes ?? undefined,
  };
}

export function dateLabelFor(startAt: Date, dayKey: string, locale: Locale = "en"): string {
  const t = messages[locale].mobile;
  const shortDate = formatZonedShortDate(startAt, undefined, locale);
  if (dayKey === "today") return fmt(t.todayDate, { date: shortDate });
  if (dayKey === "tomorrow") return fmt(t.tomorrowDate, { date: shortDate });
  return formatZonedWeekdayShortDate(startAt, undefined, locale);
}
