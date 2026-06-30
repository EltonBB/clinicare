import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import type { StaffContext } from "@/lib/staff-auth";

/**
 * Mobile self check-in / check-out. The staff member asserts their own presence
 * from the app; the admin is notified on the dashboard to verify it (see the
 * StaffCheckInToaster). Unlike the admin-side checkInStaffAction, this is lenient
 * on shift windows — a doctor checks in when they actually arrive.
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
