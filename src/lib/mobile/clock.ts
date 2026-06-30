import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { findActiveShiftWindow } from "@/lib/staff";
import type { StaffContext } from "@/lib/staff-auth";
import { getZonedDayWindow } from "@/lib/time-zone";

/**
 * Mobile self check-in / check-out. The staff member asserts their own presence
 * from the app; the admin is notified on the dashboard to verify it (see the
 * StaffCheckInToaster). Check-in is allowed ONLY inside a scheduled shift window
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
  // trust the client). Load today's shifts onward so an early-morning shift whose
  // 30-min grace opens before midnight is still matched (mirrors checkInStaffAction).
  if (action === "in") {
    const shifts = await prisma.staffShift.findMany({
      where: {
        businessId: ctx.business.id,
        staffMemberId: ctx.staffMember.id,
        startsAt: { gte: getZonedDayWindow().start },
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

  const openEntry = await prisma.staffTimeEntry.findFirst({
    where: {
      businessId: ctx.business.id,
      staffMemberId: ctx.staffMember.id,
      checkedOutAt: null,
    },
    orderBy: { checkedInAt: "desc" },
  });

  if (action === "in") {
    if (!openEntry) {
      await prisma.staffTimeEntry.create({
        data: {
          businessId: ctx.business.id,
          staffMemberId: ctx.staffMember.id,
          checkedInAt: new Date(),
        },
      });
    }
  } else if (openEntry) {
    await prisma.staffTimeEntry.update({
      where: { id: openEntry.id },
      data: { checkedOutAt: new Date() },
    });
  }

  // The admin's "Staff today" card + staff pages reflect the new clock state.
  revalidatePath("/dashboard");
  revalidatePath("/staff");
  revalidatePath(`/staff/${ctx.staffMember.id}`);

  return { ok: true, checkedIn: action === "in" };
}
