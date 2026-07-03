import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { findActiveShiftWindow } from "@/lib/staff";
import type { StaffContext } from "@/lib/staff-auth";
import { getZonedDayWindow } from "@/lib/time-zone";

/**
 * Atomically open a time entry unless one is already open — shared by the
 * mobile self check-in (below) and the admin check-in action
 * (staff/actions.ts) so both close the same race: a plain
 * find-then-create (no lock) lets two concurrent check-ins (a double-tap, or
 * admin + mobile racing) both see no open entry and both insert one,
 * double-counting the member's hours until the auto-close sweep. Serializable
 * isolation makes Postgres itself detect that write-write conflict and abort
 * the loser with P2034, which we treat as "a concurrent request already
 * checked this member in" — not a failure, since that IS the correct
 * resulting state.
 */
export async function openTimeEntryIfAbsent(
  businessId: string,
  staffMemberId: string
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        const openEntry = await tx.staffTimeEntry.findFirst({
          where: { businessId, staffMemberId, checkedOutAt: null },
        });
        if (!openEntry) {
          await tx.staffTimeEntry.create({
            data: { businessId, staffMemberId, checkedInAt: new Date() },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return;
    }
    throw error;
  }
}

/**
 * Mobile self check-in / check-out. The staff member asserts their own presence
 * from the app; the admin is notified on the dashboard to verify it (see the
 * WorkspaceToaster). Check-in is allowed ONLY inside a scheduled shift window
 * (30-min early grace through the shift end) — the same rule the admin-side
 * checkInStaffAction enforces, via the shared findActiveShiftWindow. Check-OUT is
 * always allowed so an open entry is never trapped open.
 */
export type MobileClockResult =
  | { ok: true; checkedIn: boolean }
  | { ok: false; status: number; error: string };

export async function clockStaff(
  ctx: StaffContext,
  action: "in" | "out"
): Promise<MobileClockResult> {
  if (!ctx.staffMember.isActive || ctx.staffMember.status === "INACTIVE") {
    return { ok: false, status: 403, error: "Your account isn't active. Contact your clinic admin." };
  }

  // Enforce the scheduled-shift window on check-in (server-authoritative — never
  // trust the client). Filter by endsAt (not startsAt) so an overnight shift
  // that started yesterday but hasn't ended yet is still loaded — otherwise a
  // doctor mid-overnight-shift would be refused check-in after midnight
  // (mirrors checkInStaffAction).
  if (action === "in") {
    const shifts = await prisma.staffShift.findMany({
      where: {
        businessId: ctx.business.id,
        staffMemberId: ctx.staffMember.id,
        endsAt: { gte: getZonedDayWindow().start },
      },
      select: { startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
      take: 8,
    });
    if (!findActiveShiftWindow(shifts)) {
      return {
        ok: false,
        status: 422,
        error: "You can only check in during a scheduled shift. Check with your clinic admin if your schedule looks wrong.",
      };
    }
  }

  if (action === "in") {
    await openTimeEntryIfAbsent(ctx.business.id, ctx.staffMember.id);
  } else {
    const openEntry = await prisma.staffTimeEntry.findFirst({
      where: {
        businessId: ctx.business.id,
        staffMemberId: ctx.staffMember.id,
        checkedOutAt: null,
      },
      orderBy: { checkedInAt: "desc" },
    });
    if (openEntry) {
      await prisma.staffTimeEntry.update({
        where: { id: openEntry.id },
        data: { checkedOutAt: new Date() },
      });
    }
  }

  // The admin's "Staff today" card + staff pages reflect the new clock state.
  revalidatePath("/dashboard");
  revalidatePath("/staff");
  revalidatePath(`/staff/${ctx.staffMember.id}`);

  return { ok: true, checkedIn: action === "in" };
}
