import {
  refreshClientLastVisitAt,
  revalidateCalendarSurfaces,
} from "@/lib/appointments-shared";
import { logger } from "@/lib/logger";
import { postSystemMessageToAdminThread } from "@/lib/mobile/inbox";
import { serializeAppointment, type MobileAppointment } from "@/lib/mobile/serializers";
import { prisma } from "@/lib/prisma";
import type { StaffContext } from "@/lib/staff-auth";
import {
  formatZonedDateKey,
  formatZonedTime,
  getZonedDayWindowByOffset,
} from "@/lib/time-zone";

export type MobileDay = "today" | "tomorrow";

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

/**
 * List the signed-in doctor's appointments for the given day. Scoped to BOTH the
 * business and the staff member — a doctor only ever sees their own schedule,
 * never the whole clinic. Uses the `[staffMemberId, status, startAt]` index.
 */
export async function listOwnAppointments(
  ctx: StaffContext,
  day: MobileDay
): Promise<MobileAppointment[]> {
  const window = getZonedDayWindowByOffset(new Date(), day === "tomorrow" ? 1 : 0);

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

  return appointments.map((appointment) => serializeAppointment(appointment, day));
}

export type MobileCancelResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * The mobile app's lone write: a doctor cancels a slot they can't make. Scoped to
 * the doctor's OWN appointment (another staff's id → 404). NOT the web
 * `cancelAppointmentAction` (which authorizes by business and would let a doctor
 * cancel anyone's appointment). Mirrors its side effects via the shared helpers;
 * the web calendar reflects the cancel after revalidation, which is how the admin
 * sees it today.
 */
export async function cancelOwnAppointment(
  ctx: StaffContext,
  appointmentId: string
): Promise<MobileCancelResult> {
  const existing = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      businessId: ctx.business.id,
      staffMemberId: ctx.staffMember.id,
    },
    select: {
      id: true,
      clientId: true,
      staffMemberId: true,
      status: true,
      startAt: true,
      client: { select: { name: true } },
    },
  });

  if (!existing) {
    return { ok: false, status: 404, error: "Appointment not found." };
  }

  if (existing.status === "CANCELLED") {
    return { ok: true }; // idempotent — already cancelled
  }

  // Never trust the client: a COMPLETED visit can't be cancelled (the app hides
  // the button, but the endpoint must enforce it too — otherwise a crafted
  // request would corrupt completion metrics and the client's last-visit date).
  if (existing.status === "COMPLETED") {
    return {
      ok: false,
      status: 409,
      error: "This visit is already completed and can't be cancelled.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: "CANCELLED" },
    });
    // Clear any pending reminder rows so a later re-confirm starts clean.
    await tx.appointmentReminder.deleteMany({ where: { appointmentId } });
    await refreshClientLastVisitAt(existing.clientId, ctx.business.id, tx);
  });

  revalidateCalendarSurfaces([existing.clientId], [existing.staffMemberId]);

  // Surface the cancellation to the admin in the staff↔admin thread so they can
  // reschedule/reassign — minimum-necessary scheduling info (name + time, no
  // clinical detail). Best-effort: a failed notice must not fail the cancel.
  try {
    await postSystemMessageToAdminThread(
      ctx.business.id,
      ctx.staffMember.id,
      `Cancelled the ${formatZonedTime(existing.startAt)} appointment with ${existing.client.name} — please reschedule.`
    );
  } catch (error) {
    logger.error("Failed to post cancellation notice to the admin thread.", error, {
      appointmentId,
    });
  }

  return { ok: true };
}
