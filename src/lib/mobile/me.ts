import type { StaffDevice } from "@prisma/client";

import { serializeMe, type MobileDoctor } from "@/lib/mobile/serializers";
import { prisma } from "@/lib/prisma";
import { buildStaffDirectoryRecord } from "@/lib/staff";
import { getZonedDayWindow, getZonedWeekWindow } from "@/lib/time-zone";

/**
 * Load the `/me` view model for a device's staff member. Used by both the redeem
 * and `/me` endpoints. Bounded query — this week's time entries (plus any still
 * open) and shifts still active from today onward (bounded to 8), which is all
 * the directory record needs to derive `isCheckedIn`, `shiftLabel`, and `canClock`.
 */
export async function loadMobileMe(device: StaffDevice): Promise<MobileDoctor | null> {
  const week = getZonedWeekWindow();
  const day = getZonedDayWindow();

  const [member, business] = await Promise.all([
    prisma.staffMember.findUnique({
      where: { id: device.staffMemberId },
      include: {
        timeEntries: {
          where: { OR: [{ checkedOutAt: null }, { checkedInAt: { gte: week.start } }] },
          select: { checkedInAt: true, checkedOutAt: true },
        },
        shifts: {
          // endsAt (not a startsAt window) so an overnight shift that started
          // yesterday but hasn't ended yet still shows canClock correctly,
          // consistent with the clockStaff enforcement query.
          where: { endsAt: { gte: day.start } },
          select: { id: true, startsAt: true, endsAt: true, status: true },
          orderBy: { startsAt: "asc" },
          take: 8,
        },
      },
    }),
    prisma.business.findUnique({
      where: { id: device.businessId },
      select: { name: true },
    }),
  ]);

  if (!member) {
    return null;
  }

  const item = buildStaffDirectoryRecord(member);
  return serializeMe({
    item,
    clinicName: business?.name ?? "",
    device,
  });
}
