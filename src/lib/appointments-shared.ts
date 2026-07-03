import { revalidatePath } from "next/cache";

import { Prisma } from "@prisma/client";

import { logger } from "@/lib/logger";
import { buildStaffPushPayload, sendStaffPush } from "@/lib/mobile/push";
import { prisma } from "@/lib/prisma";

/**
 * Appointment-mutation side effects shared by the web calendar actions and the
 * mobile staff API. Kept in one place so both paths recompute the same derived
 * state and invalidate the same Router-Cache surfaces (the "revalidate every
 * surface a mutation feeds" rule).
 */

/**
 * Recompute a client's `lastVisitAt` from their remaining confirmed/completed
 * visits that have actually happened — bounded by `startAt <= now` so a
 * future confirmed booking is never read as a past visit (which would mask
 * the "no visit in 90+ days" attention segment and disagree with the detail
 * page, which shows this same field).
 */
export async function refreshClientLastVisitAt(
  clientId: string,
  businessId: string,
  db: Prisma.TransactionClient = prisma
) {
  const latestAppointment = await db.appointment.findFirst({
    where: {
      businessId,
      clientId,
      status: {
        in: ["CONFIRMED", "COMPLETED"],
      },
      startAt: {
        lte: new Date(),
      },
    },
    select: {
      startAt: true,
    },
    orderBy: {
      startAt: "desc",
    },
  });

  await db.client.updateMany({
    where: {
      id: clientId,
      businessId,
    },
    data: {
      lastVisitAt: latestAppointment?.startAt ?? null,
    },
  });
}

export type AppointmentMutationOutcome =
  | {
      ok: true;
      appointmentId: string;
      clientId: string;
      staffMemberId: string | null;
      /** False for the idempotent already-cancelled no-op — callers should skip
       *  re-revalidating/re-notifying since nothing actually changed. */
      changed: boolean;
    }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Cancel an appointment: ownership-scoped lookup, refuses to cancel a
 * COMPLETED visit (the visit already happened — flipping it to CANCELLED
 * would corrupt completion-rate metrics and the client's last-visit date),
 * and runs the status update + reminder cleanup + lastVisitAt refresh as one
 * atomic transaction. Shared by the web calendar action and the mobile staff
 * API so both enforce the same rule. `where` carries whatever scoping the
 * caller needs — the mobile API additionally scopes by staffMemberId so a
 * doctor can only cancel their own appointments; the web admin action scopes
 * by business only.
 */
export async function cancelAppointmentCore(where: {
  id: string;
  businessId: string;
  staffMemberId?: string;
}): Promise<AppointmentMutationOutcome> {
  const existing = await prisma.appointment.findFirst({
    where,
    select: { id: true, clientId: true, staffMemberId: true, status: true },
  });

  if (!existing) {
    return { ok: false, status: 404, error: "Appointment not found." };
  }

  if (existing.status === "CANCELLED") {
    // Idempotent — nothing left to do.
    return {
      ok: true,
      appointmentId: existing.id,
      clientId: existing.clientId,
      staffMemberId: existing.staffMemberId,
      changed: false,
    };
  }

  if (existing.status === "COMPLETED") {
    return {
      ok: false,
      status: 409,
      error: "This visit is already completed and can't be cancelled.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });
    // Clear any pending reminder rows so a later re-confirm starts clean.
    await tx.appointmentReminder.deleteMany({ where: { appointmentId: existing.id } });
    await refreshClientLastVisitAt(existing.clientId, where.businessId, tx);
  });

  return {
    ok: true,
    appointmentId: existing.id,
    clientId: existing.clientId,
    staffMemberId: existing.staffMemberId,
    changed: true,
  };
}

/**
 * Delete an appointment: ownership-scoped lookup, then the delete and
 * lastVisitAt refresh as one atomic transaction (previously two separate
 * writes — a fault between them could leave a stale lastVisitAt pointing past
 * a now-deleted appointment). AppointmentReminder rows cascade-delete at the
 * DB level (schema `onDelete: Cascade`), so no separate cleanup is needed here.
 */
export async function deleteAppointmentCore(where: {
  id: string;
  businessId: string;
  staffMemberId?: string;
}): Promise<AppointmentMutationOutcome> {
  const existing = await prisma.appointment.findFirst({
    where,
    select: { id: true, clientId: true, staffMemberId: true },
  });

  if (!existing) {
    return { ok: false, status: 404, error: "Appointment not found." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.delete({ where: { id: existing.id } });
    await refreshClientLastVisitAt(existing.clientId, where.businessId, tx);
  });

  return {
    ok: true,
    appointmentId: existing.id,
    clientId: existing.clientId,
    staffMemberId: existing.staffMemberId,
    changed: true,
  };
}

// Invalidate the Router Cache for every surface an appointment mutation touches
// (calendar grid, dashboard schedule/KPIs, the client's directory row + detail
// timeline) so the change shows on navigation without a manual refresh.
export function revalidateCalendarSurfaces(
  clientIds: Array<string | null | undefined> = [],
  staffMemberIds: Array<string | null | undefined> = []
) {
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/clients");
  // Reports' appointment volume + completion-rate KPIs depend on this.
  revalidatePath("/reports");
  // Staff directory derives today's appointment counts; each staff detail page
  // lists that member's appointments.
  revalidatePath("/staff");
  // Dedup so a move that keeps the same client/staff doesn't revalidate twice.
  for (const clientId of new Set(clientIds)) {
    if (clientId) {
      revalidatePath(`/clients/${clientId}`);
    }
  }
  for (const staffMemberId of new Set(staffMemberIds)) {
    if (staffMemberId) {
      revalidatePath(`/staff/${staffMemberId}`);
    }
  }
}

/**
 * Tell the assigned doctor's mobile app that the admin changed one of their
 * appointments (cancelled or deleted) — the reverse direction of the doctor's
 * own cancel, which already notifies the admin. Without this a doctor only
 * finds out by noticing their schedule looks different. Best-effort: never
 * blocks or fails the mutation it followed.
 *
 * `deepLinkAppointmentId` should be omitted for a delete — the row is gone,
 * so a deep link to it would 404 in the app. A cancel keeps the row (status
 * only), so it's safe to link to.
 */
export async function notifyStaffOfAppointmentChange(
  businessId: string,
  staffMemberId: string | null,
  deepLinkAppointmentId: string | null
): Promise<void> {
  if (!staffMemberId) {
    return;
  }
  try {
    await prisma.staffNotification.create({
      data: {
        businessId,
        staffMemberId,
        kind: "APPOINTMENT",
        title: "Schedule updated",
        body: "Your clinic changed one of your appointments.",
        linkType: deepLinkAppointmentId ? "appointment" : null,
        linkId: deepLinkAppointmentId,
      },
    });
    const devices = await prisma.staffDevice.findMany({
      where: { businessId, staffMemberId, revokedAt: null, expoPushToken: { not: null } },
      select: { expoPushToken: true },
    });
    await sendStaffPush(
      devices.map((device) => device.expoPushToken),
      buildStaffPushPayload(
        deepLinkAppointmentId
          ? { kind: "appointment", linkType: "appointment", linkId: deepLinkAppointmentId }
          : { kind: "appointment" }
      )
    );
  } catch (error) {
    logger.error("Failed to notify staff of an appointment change.", error, { staffMemberId });
  }
}
