import {
  refreshClientLastVisitAt,
  revalidateCalendarSurfaces,
} from "@/lib/appointments-shared";
import { serializeAppointment, type MobileAppointment } from "@/lib/mobile/serializers";
import { prisma } from "@/lib/prisma";
import type { StaffContext } from "@/lib/staff-auth";
import { getZonedDayWindowByOffset } from "@/lib/time-zone";

export type MobileDay = "today" | "tomorrow";

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
    select: { id: true, clientId: true, staffMemberId: true, status: true },
  });

  if (!existing) {
    return { ok: false, status: 404, error: "Appointment not found." };
  }

  if (existing.status === "CANCELLED") {
    return { ok: true }; // idempotent — already cancelled
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

  // TODO(phase 6): post a system message to the doctor↔admin thread + push so the
  // admin is actively notified to reschedule/reassign, once that surface exists.
  revalidateCalendarSurfaces([existing.clientId], [existing.staffMemberId]);

  return { ok: true };
}
