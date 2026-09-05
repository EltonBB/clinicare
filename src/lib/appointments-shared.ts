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
 *
 * Known narrow race, accepted rather than guarded: this is a read then a
 * separate write, not a compare-and-set, so two concurrent callers refreshing
 * the SAME client from DIFFERENT appointments (e.g. a cancel racing the
 * completePastConfirmedAppointments sweep on another visit) could have the
 * one that read first also write last, leaving a stale value. Closing this
 * fully needs either raw SQL (an atomic `UPDATE ... SET x = (subquery)` —
 * this codebase has none today) or a schema change for optimistic
 * concurrency; not worth either for a display field that self-corrects on
 * this client's next appointment mutation and never corrupts data.
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

// A completed visit already happened — moving it to CANCELLED would corrupt
// the completion-rate metric and the client's last-visit date. Shared so the
// dedicated Cancel action (cancelAppointmentCore, below) and the edit-save
// path (saveAppointmentAction in calendar/actions.ts, which enforces the
// same rule for the Status dropdown) show one consistent message instead of
// two independently-typed copies drifting apart.
export const APPOINTMENT_ALREADY_COMPLETED_ERROR =
  "This visit is already completed and can't be cancelled.";

// Generic "something else changed this row between when we checked and when
// we wrote" conflict — distinct from the terminal-state-specific message
// above. Shared so cancelAppointmentCore's own race-disambiguation fallback
// (below) and saveAppointmentAction's guard-miss (calendar/actions.ts) show
// one consistent message instead of two independently-typed copies.
export const APPOINTMENT_CONFLICT_ERROR =
  "This appointment was changed elsewhere. Refresh and try again.";

// Shared by every guarded-mutation miss that means "no row matched — never
// existed, out of scope, or already removed by a concurrent request" (as
// opposed to the terminal-state/conflict messages above, which mean the row
// exists but the requested change isn't allowed).
export const APPOINTMENT_NOT_FOUND_ERROR = "Appointment not found.";

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
 * Cancel an appointment via compare-and-set: the terminal-state guard
 * (refuses COMPLETED — the visit already happened, flipping it to CANCELLED
 * would corrupt completion-rate metrics and the client's last-visit date —
 * and no-ops idempotently on an already-CANCELLED row) is folded into the
 * update's own WHERE clause, not a separate read, so a concurrent status
 * change can't be silently overwritten. Runs the status update + reminder
 * cleanup + lastVisitAt refresh as one atomic transaction. Shared by the web
 * calendar action and the mobile staff
 * API so both enforce the same rule. `where` carries whatever scoping the
 * caller needs — the mobile API additionally scopes by staffMemberId so a
 * doctor can only cancel their own appointments; the web admin action scopes
 * by business only.
 *
 * Investigated 2026-09-04: a report of "duplicate cancellation notifications"
 * for one appointment turned out not to be a bug here. The CAS guard above
 * makes `changed: true` mathematically impossible to return twice for one
 * continuous CANCELLED state — a second `changed: true` for the same row
 * requires an intervening write that moves status OFF CANCELLED first. The
 * flagged incident's own data confirmed exactly that: each of the two
 * "Cancellation sent" mobile notifications was immediately preceded (within
 * ~1 minute) by a "Schedule updated" notification from saveAppointmentAction's
 * shouldResetReminders branch — i.e. the appointment was reactivated via the
 * web calendar shortly before each mobile cancel, making both cancellations
 * genuine, independent events rather than one event double-reported. Every
 * caller of this function (cancelAppointmentAction, cancelOwnAppointment)
 * already gates its own notification on `outcome.changed`, so a truly
 * redundant re-cancel of an unchanged CANCELLED row is provably silent.
 */
export async function cancelAppointmentCore(where: {
  id: string;
  businessId: string;
  staffMemberId?: string;
}): Promise<AppointmentMutationOutcome> {
  return prisma.$transaction(async (tx) => {
    // Compare-and-set: the terminal-state guard is folded into the update's
    // WHERE clause so Postgres evaluates it against the row's current
    // committed state, not a possibly-stale earlier read. Without this, a
    // concurrent completePastConfirmedAppointments sweep landing between a
    // read and a separate write could flip a visit to COMPLETED and then
    // have this cancel silently overwrite it back to CANCELLED. CANCELLED
    // is excluded too — otherwise a re-cancel of an already-cancelled row
    // still matches (Postgres counts a matched no-op UPDATE as affected),
    // so `count` would be 1 and the idempotent branch below could never run.
    const { count } = await tx.appointment.updateMany({
      where: { ...where, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      data: { status: "CANCELLED" },
    });

    if (count === 0) {
      // The guarded update didn't apply — read-only lookup (no race risk)
      // just to tell the caller why: not found, blocked by COMPLETED, or
      // already CANCELLED (idempotent).
      const existing = await tx.appointment.findFirst({
        where,
        select: { id: true, clientId: true, staffMemberId: true, status: true },
      });

      if (!existing) {
        return { ok: false, status: 404, error: APPOINTMENT_NOT_FOUND_ERROR };
      }

      if (existing.status === "COMPLETED") {
        return {
          ok: false,
          status: 409,
          error: APPOINTMENT_ALREADY_COMPLETED_ERROR,
        };
      }

      if (existing.status !== "CANCELLED") {
        // Under READ COMMITTED, this read is a separate statement from the
        // guarded update above and can observe a LATER commit than it did:
        // the row may have been COMPLETED when the update ran (hence count
        // 0), but a concurrent edit already moved it back to CONFIRMED
        // (undoing an accidental auto-complete is a supported flow) by the
        // time this diagnostic read runs. Assuming CANCELLED here would
        // report a fake success without ever cancelling the appointment, so
        // any status that's neither COMPLETED nor CANCELLED is a conflict —
        // same as saveAppointmentAction's guard-miss, and the caller retries
        // the same way.
        return { ok: false, status: 409, error: APPOINTMENT_CONFLICT_ERROR };
      }

      // existing.status === "CANCELLED": idempotent, nothing left to do.
      return {
        ok: true,
        appointmentId: existing.id,
        clientId: existing.clientId,
        staffMemberId: existing.staffMemberId,
        changed: false,
      };
    }

    // The guarded update applied — this call is the one that just cancelled it.
    const cancelled = await tx.appointment.findFirstOrThrow({
      where: { id: where.id },
      select: { id: true, clientId: true, staffMemberId: true },
    });

    // Clear any pending reminder rows so a later re-confirm starts clean.
    await tx.appointmentReminder.deleteMany({ where: { appointmentId: cancelled.id } });
    await refreshClientLastVisitAt(cancelled.clientId, where.businessId, tx);

    return {
      ok: true,
      appointmentId: cancelled.id,
      clientId: cancelled.clientId,
      staffMemberId: cancelled.staffMemberId,
      changed: true,
    };
  });
}

/**
 * Delete an appointment via compare-and-set: the existence check is folded
 * into the delete's own WHERE clause (`deleteMany`, not `.delete`), so a
 * concurrent delete of the same row (a double-click, or two admin tabs)
 * reports `count: 0` instead of `.delete` throwing Prisma's P2025 "Record
 * not found" for a row that's already gone. Unlike cancelAppointmentCore
 * there's no terminal-state business rule to enforce here (no "can't delete
 * a COMPLETED appointment") and no idempotent-success case, so a guard miss
 * is always reported as not-found — no diagnostic re-read needed. The
 * initial read only captures clientId/staffMemberId for the return value and
 * lastVisitAt refresh; it never gates the delete itself, so a stale read
 * here can't cause an incorrect delete. AppointmentReminder rows
 * cascade-delete at the DB level (schema `onDelete: Cascade`), so no
 * separate cleanup is needed here.
 */
export async function deleteAppointmentCore(where: {
  id: string;
  businessId: string;
  staffMemberId?: string;
}): Promise<AppointmentMutationOutcome> {
  const existing = await prisma.appointment.findFirst({
    where,
    select: { clientId: true, staffMemberId: true },
  });

  if (!existing) {
    return { ok: false, status: 404, error: APPOINTMENT_NOT_FOUND_ERROR };
  }

  return prisma.$transaction(async (tx) => {
    // Compare-and-set: scope the delete by the same `where` used to find the
    // row above. If a concurrent request already deleted it between that
    // read and this statement, `count` is 0 and this call becomes a no-op
    // instead of throwing.
    const { count } = await tx.appointment.deleteMany({ where });

    if (count === 0) {
      return { ok: false, status: 404, error: APPOINTMENT_NOT_FOUND_ERROR };
    }

    await refreshClientLastVisitAt(existing.clientId, where.businessId, tx);

    return {
      ok: true,
      appointmentId: where.id,
      clientId: existing.clientId,
      staffMemberId: existing.staffMemberId,
      changed: true,
    };
  });
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
 * appointments (cancelled, deleted, rescheduled, reassigned, or newly booked)
 * — the reverse direction of the doctor's own cancel, which already notifies
 * the admin. Without this a doctor only finds out by noticing their schedule
 * looks different. Best-effort: never blocks or fails the mutation it followed.
 *
 * `deepLinkAppointmentId` should be omitted for a delete — the row is gone,
 * so a deep link to it would 404 in the app. Cancel/reschedule/reassign/create
 * all keep the row, so it's safe to link to.
 *
 * `reason` only varies the copy: "new" for a booking that didn't exist before,
 * "changed" (default) for everything else — the doctor already had this slot
 * and something about it moved.
 */
export async function notifyStaffOfAppointmentChange(
  businessId: string,
  staffMemberId: string | null,
  deepLinkAppointmentId: string | null,
  reason: "new" | "changed" = "changed"
): Promise<void> {
  if (!staffMemberId) {
    return;
  }
  try {
    // Defense-in-depth: every current caller already resolves staffMemberId
    // through a businessId-scoped lookup before reaching here, but this is a
    // privileged sink (writes a notification + sends a push) — verify the
    // pair itself rather than trusting callers to stay disciplined forever,
    // matching the same staffMember.findFirst({ id, businessId }) guard used
    // at every other call site that touches staff data.
    const staffMember = await prisma.staffMember.findFirst({
      where: { id: staffMemberId, businessId },
      select: { id: true },
    });
    if (!staffMember) {
      logger.error("notifyStaffOfAppointmentChange called with a staffMemberId outside businessId.", undefined, {
        businessId,
        staffMemberId,
      });
      return;
    }
    await prisma.staffNotification.create({
      data: {
        businessId,
        staffMemberId,
        kind: "APPOINTMENT",
        title: reason === "new" ? "New appointment" : "Schedule updated",
        body:
          reason === "new"
            ? "Your clinic booked a new appointment for you."
            : "Your clinic changed one of your appointments.",
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
