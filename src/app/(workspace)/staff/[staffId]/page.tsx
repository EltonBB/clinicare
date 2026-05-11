import { notFound } from "next/navigation";

import { StaffDetailsPage } from "@/components/staff/staff-details-page";
import { requireCurrentWorkspace } from "@/lib/business";
import { buildStaffRecord } from "@/lib/staff";
import { prisma } from "@/lib/prisma";

function completedAppointmentCutoff() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function staffTimeEntryCutoff() {
  return new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
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
  });

  if (!staff) {
    notFound();
  }

  return <StaffDetailsPage initialStaff={buildStaffRecord(staff)} />;
}
