import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StaffDetailsPage } from "@/components/staff/staff-details-page";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";
import { requireCurrentWorkspace } from "@/lib/business";
import { getAdminThread } from "@/lib/mobile/admin-inbox";
import { getMobileAccessStatus } from "@/lib/mobile/admin";
import { buildStaffRecord, staffRecordAppointmentWindow } from "@/lib/staff";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.staff.meta.member };
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
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { business } = await requireCurrentWorkspace("/staff", {
    missingBusinessRedirect: "/onboarding",
  });
  const { staffId } = await params;
  const { tab } = await searchParams;

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
        select: {
          id: true,
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
      appointments: {
        where: {
          startAt: staffRecordAppointmentWindow(),
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

  const { locale } = await getI18n();
  const [mobileAccess, adminThread] = await Promise.all([
    getMobileAccessStatus(business.id, staffId, locale),
    getAdminThread(business.id, staffId, locale),
  ]);

  return (
    <WithMessages namespaces={["staff"]}>
      <StaffDetailsPage
        initialStaff={buildStaffRecord(staff, locale)}
        mobileAccess={mobileAccess}
        adminThread={adminThread}
        initialTab={tab === "messages" ? "messages" : "overview"}
      />
    </WithMessages>
  );
}
