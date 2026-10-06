import type { AppointmentStatus } from "@prisma/client";

/**
 * The lowercase, hyphenated name used wherever an appointment status is shown
 * or styled (NO_SHOW → "no-show"). Plain `.toLowerCase()` would leak the
 * underscore ("no_show") into badges and copy.
 */
export function appointmentStatusKey(status: AppointmentStatus) {
  return status.toLowerCase().replace("_", "-");
}
