import {
  cancelAppointmentCore,
  revalidateCalendarSurfaces,
} from "@/lib/appointments-shared";
import { logger } from "@/lib/logger";
import { postSystemMessageToAdminThread } from "@/lib/mobile/inbox";
import {
  dateLabelFor,
  serializeAppointment,
  type MobileAppointment,
} from "@/lib/mobile/serializers";
import { prisma } from "@/lib/prisma";
import type { StaffContext } from "@/lib/staff-auth";
import {
  formatZonedDateKey,
  formatZonedTime,
  getZonedDayWindowByOffset,
} from "@/lib/time-zone";

/** Day key for an arbitrary appointment: today / tomorrow / its clinic-local date. */
function resolveDayKey(startAt: Date): "today" | "tomorrow" | string {
  const key = formatZonedDateKey(startAt);
  if (key === formatZonedDateKey()) return "today";
  if (key === formatZonedDateKey(getZonedDayWindowByOffset(new Date(), 1).start)) {
    return "tomorrow";
  }
  return key;
}

/**
 * One appointment by id, scoped to the signed-in doctor (another staff's id →
 * null → 404). Backs the appointment-detail screen and notification deep links,
 * so a tapped push resolves even when the visit isn't in today/tomorrow.
 */
export async function getOwnAppointment(
  ctx: StaffContext,
  appointmentId: string
): Promise<MobileAppointment | null> {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      businessId: ctx.business.id,
      staffMemberId: ctx.staffMember.id,
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      status: true,
      notes: true,
      client: { select: { name: true } },
    },
  });
  if (!appointment) {
    return null;
  }
  return serializeAppointment(appointment, resolveDayKey(appointment.startAt));
}

export type MobileAppointmentsResult = {
  date: { key: string; label: string };
  appointments: MobileAppointment[];
};

/**
 * List the signed-in doctor's appointments for an arbitrary clinic-local day,
 * given as an offset from today (0 = today, 1 = tomorrow, -1 = yesterday, ...)
 * so a doctor can page through their week, not just today/tomorrow. Scoped to
 * BOTH the business and the staff member — a doctor only ever sees their own
 * schedule, never the whole clinic. Uses the `[staffMemberId, status, startAt]`
 * index.
 */
export async function listOwnAppointments(
  ctx: StaffContext,
  dayOffset = 0
): Promise<MobileAppointmentsResult> {
  const window = getZonedDayWindowByOffset(new Date(), dayOffset);
  const dayKey = resolveDayKey(window.start);

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId: ctx.business.id,
      staffMemberId: ctx.staffMember.id,
      startAt: { gte: window.start, lte: window.end },
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      status: true,
      notes: true,
      client: { select: { name: true } },
    },
    orderBy: { startAt: "asc" },
  });

  return {
    date: { key: formatZonedDateKey(window.start), label: dateLabelFor(window.start, dayKey) },
    appointments: appointments.map((appointment) => serializeAppointment(appointment, dayKey)),
  };
}

export type MobileCancelResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * The mobile app's lone write: a doctor cancels a slot they can't make. Runs
 * through the SAME `cancelAppointmentCore` as the web calendar action (so the
 * COMPLETED-guard and transactional side effects can't drift between them
 * again), scoped additionally by staffMemberId — another staff's id 404s,
 * unlike the web admin action which authorizes by business only. The web
 * calendar reflects the cancel after revalidation, which is how the admin
 * sees it today.
 */
export async function cancelOwnAppointment(
  ctx: StaffContext,
  appointmentId: string
): Promise<MobileCancelResult> {
  // Shared with the web calendar action: ownership-scoped lookup, refuses to
  // cancel a COMPLETED visit, and the status update + reminder cleanup +
  // lastVisitAt refresh run as one atomic transaction. Scoped by
  // staffMemberId too (unlike the web admin action) — another staff's id 404s.
  const outcome = await cancelAppointmentCore({
    id: appointmentId,
    businessId: ctx.business.id,
    staffMemberId: ctx.staffMember.id,
  });

  if (!outcome.ok) {
    return { ok: false, status: outcome.status, error: outcome.error };
  }

  if (!outcome.changed) {
    // Already cancelled — nothing new to reflect or notify the admin about.
    return { ok: true };
  }

  revalidateCalendarSurfaces([outcome.clientId], [outcome.staffMemberId]);

  // Surface the cancellation to the admin in the staff↔admin thread so they can
  // reschedule/reassign — minimum-necessary scheduling info (name + time, no
  // clinical detail). Best-effort: a failed notice must not fail the cancel.
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: outcome.appointmentId },
      select: { startAt: true, client: { select: { name: true } } },
    });
    if (appointment) {
      await postSystemMessageToAdminThread(
        ctx.business.id,
        ctx.staffMember.id,
        `Cancelled the ${formatZonedTime(appointment.startAt)} appointment with ${appointment.client.name} — please reschedule.`
      );
    }
  } catch (error) {
    logger.error("Failed to post cancellation notice to the admin thread.", error, {
      appointmentId,
    });
  }

  return { ok: true };
}
