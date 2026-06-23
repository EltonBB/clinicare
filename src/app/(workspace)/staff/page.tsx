import { redirect } from "next/navigation";

import { StaffWorkspace } from "@/components/staff/staff-workspace";
import { requireCurrentWorkspace } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { buildStaffViewFromRecords } from "@/lib/staff";
import { getStaffDirectoryCounts } from "@/lib/staff-data";
import { getZonedDayWindow, getZonedMonthWindow } from "@/lib/time-zone";

function completedAppointmentCutoff() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function staffShiftCutoff() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

function staffTimeEntryCutoff() {
  return new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string; new?: string }>;
}) {
  const { business } = await requireCurrentWorkspace("/staff", {
    missingBusinessRedirect: "/onboarding",
  });
  const { staff: requestedStaffId, new: openNew } = await searchParams;

  if (openNew === "1") {
    redirect("/staff/new");
  }

  if (typeof requestedStaffId === "string" && requestedStaffId.length > 0) {
    const matchingStaff = await prisma.staffMember.findFirst({
      where: {
        id: requestedStaffId,
        businessId: business.id,
      },
      select: {
        id: true,
      },
    });

    if (matchingStaff) {
      redirect(`/staff/${matchingStaff.id}`);
    }
  }

  const now = new Date();
  const todayWindow = getZonedDayWindow(now);
  const monthWindow = getZonedMonthWindow(now);

  // Per-staff appointment counts are aggregated in the DB (see lib/staff-data.ts)
  // instead of loading every month-to-date appointment per member just to count.
  const [records, countsByStaff] = await Promise.all([
    prisma.staffMember.findMany({
      where: {
        businessId: business.id,
      },
      include: {
        timeEntries: {
          where: {
            checkedInAt: {
              gte: staffTimeEntryCutoff(),
            },
          },
          select: {
            checkedInAt: true,
            checkedOutAt: true,
          },
          orderBy: {
            checkedInAt: "desc",
          },
        },
        shifts: {
          where: {
            startsAt: {
              gte: staffShiftCutoff(),
            },
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
          orderBy: {
            startsAt: "asc",
          },
          take: 8,
        },
      },
      orderBy: [
        {
          isActive: "desc",
        },
        {
          name: "asc",
        },
      ],
    }),
    getStaffDirectoryCounts({
      businessId: business.id,
      completionCutoff: completedAppointmentCutoff(),
      monthStart: monthWindow.start,
      monthEnd: monthWindow.end,
      todayStart: todayWindow.start,
      todayEnd: todayWindow.end,
    }),
  ]);

  const initialView = buildStaffViewFromRecords(records, countsByStaff);

  return <StaffWorkspace initialView={initialView} />;
}
