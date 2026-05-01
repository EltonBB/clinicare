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
        include: {
          client: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          startAt: "desc",
        },
        take: 50,
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
  const initialSelectedStaffId =
    typeof requestedStaffId === "string" &&
    initialView.staff.some((record) => record.id === requestedStaffId)
      ? requestedStaffId
      : initialView.initialSelectedStaffId;

  return (
    <StaffWorkspace
      initialView={{
        ...initialView,
        initialSelectedStaffId,
      }}
      initialNewStaffOpen={openNew === "1"}
    />
  );
}
