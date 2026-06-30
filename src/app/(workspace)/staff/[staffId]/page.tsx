import { notFound } from "next/navigation";

import { StaffDetailsPage } from "@/components/staff/staff-details-page";
import { requireCurrentWorkspace } from "@/lib/business";
import { getAdminThread } from "@/lib/mobile/admin-inbox";
import { getMobileAccessStatus } from "@/lib/mobile/admin";
import { buildStaffRecord } from "@/lib/staff";
import { prisma } from "@/lib/prisma";

function completedAppointmentCutoff() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function staffTimeEntryCutoff() {
  return new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
}

function staffShiftCutoff() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

export default async function StaffDetailsRoute({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const { business } = await requireCurrentWorkspace("/staff", {
    missingBusinessRedirect: "/onboarding",
  });
  const { staffId } = await params;

  const staff = await prisma.staffMember.findFirst({
    where: {
      id: staffId,
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
      appointments: {
        where: {
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
  });

  if (!staff) {
    notFound();
  }

  const [mobileAccess, adminThread] = await Promise.all([
    getMobileAccessStatus(business.id, staffId),
    getAdminThread(business.id, staffId),
  ]);

  return (
    <StaffDetailsPage
      initialStaff={buildStaffRecord(staff)}
      mobileAccess={mobileAccess}
      adminThread={adminThread}
    />
  );
}
