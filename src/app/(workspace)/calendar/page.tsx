import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { buildCalendarViewFromRecords } from "@/lib/calendar";

export default async function CalendarPage() {
  const { user, business } = await requireCurrentWorkspace("/calendar", {
    missingBusinessRedirect: "/onboarding",
  });
  const { ownerName } = toBusinessIdentity(business, user);

  const [appointments, clients, staffMembers] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        businessId: business.id,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        staffMember: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startAt: "asc",
      },
    }),
    prisma.client.findMany({
      where: {
        businessId: business.id,
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.staffMember.findMany({
      where: {
        businessId: business.id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  const initialView = buildCalendarViewFromRecords({
    appointments,
    clients,
    staffMembers,
    ownerName,
  });

  return <CalendarWorkspace initialView={initialView} ownerName={ownerName} />;
}
