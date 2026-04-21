import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { buildCalendarViewFromRecords } from "@/lib/calendar";

function isValidDateParam(value?: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; client?: string; date?: string }>;
}) {
  const { user, business } = await requireCurrentWorkspace("/calendar", {
    missingBusinessRedirect: "/onboarding",
  });
  const { ownerName } = toBusinessIdentity(business, user);
  const {
    new: openNew,
    client: requestedClientId,
    date: requestedDate,
  } = await searchParams;

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
    initialDate: isValidDateParam(requestedDate) ? requestedDate : undefined,
  });

  const initialClientId =
    typeof requestedClientId === "string" &&
    clients.some((client) => client.id === requestedClientId)
      ? requestedClientId
      : undefined;

  return (
    <CalendarWorkspace
      initialView={initialView}
      ownerName={ownerName}
      initialCreateOpen={openNew === "1"}
      initialClientId={initialClientId}
    />
  );
}
