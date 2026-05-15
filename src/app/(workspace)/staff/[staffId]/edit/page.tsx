import { notFound } from "next/navigation";

import { NewStaffForm } from "@/components/staff/new-staff-form";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
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

function staffShiftCutoff() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
}

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const { business } = await requireCurrentWorkspace("/staff", {
    missingBusinessRedirect: "/onboarding",
  });
  const { staffId } = await params;

  const [staff, businessHours] = await Promise.all([
    prisma.staffMember.findFirst({
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
    }),
    prisma.businessHours.findMany({
      where: {
        businessId: business.id,
      },
      select: {
        weekday: true,
        isOpen: true,
        startTime: true,
        endTime: true,
      },
      orderBy: {
        weekday: "asc",
      },
    }),
  ]);

  if (!staff) {
    notFound();
  }

  const record = buildStaffRecord(staff);

  return (
    <CreatePageShell
      eyebrow="Staff workspace"
      title={`Edit ${record.name}`}
      description="Update the staff profile used for booking ownership, time tracking, and completed work records."
      backHref={`/staff/${record.id}`}
      backLabel="staff details"
    >
      <NewStaffForm staff={record} businessHours={businessHours} />
    </CreatePageShell>
  );
}
