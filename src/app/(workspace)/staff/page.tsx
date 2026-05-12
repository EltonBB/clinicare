import { redirect } from "next/navigation";

import { StaffWorkspace } from "@/components/staff/staff-workspace";
import { requireCurrentWorkspace } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { buildStaffViewFromRecords } from "@/lib/staff";

function completedAppointmentCutoff() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
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

  const records = await prisma.staffMember.findMany({
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
        orderBy: {
          checkedInAt: "desc",
        },
      },
      appointments: {
        where: {
          status: "COMPLETED",
          startAt: {
            gte: completedAppointmentCutoff(),
          },
        },
        select: {
          startAt: true,
          status: true,
        },
        orderBy: {
          startAt: "desc",
        },
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
  });

  const initialView = buildStaffViewFromRecords(records);

  return <StaffWorkspace initialView={initialView} />;
}
