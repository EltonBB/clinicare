import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { buildCalendarViewFromRecords } from "@/lib/calendar";
import { redirect } from "next/navigation";
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";

function isValidDateParam(value?: string): value is string {
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
  const initialDate = isValidDateParam(requestedDate)
    ? parseISO(requestedDate)
    : new Date();
  const rangeStart = startOfMonth(subMonths(initialDate, 1));
  const rangeEnd = endOfMonth(addMonths(initialDate, 4));

  if (openNew === "1") {
    const params = new URLSearchParams();
    if (typeof requestedClientId === "string") {
      params.set("client", requestedClientId);
    }
    if (isValidDateParam(requestedDate)) {
      params.set("date", requestedDate);
    }
    redirect(`/calendar/new${params.size ? `?${params.toString()}` : ""}`);
  }

  const [appointments, scheduleBlocks, clientCount, staffMembers, businessHours] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        businessId: business.id,
        status: {
          not: "COMPLETED",
        },
        startAt: {
          gte: rangeStart,
          lte: rangeEnd,
        },
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
      // Defensive runaway guard — this 6-month window has no natural upper
      // bound otherwise, and a high-volume clinic would ship its entire
      // window as one RSC payload with no cap at all.
      take: 2000,
    }),
    prisma.scheduleBlock.findMany({
      where: {
        businessId: business.id,
        // Interval overlap, not "starts inside the range" — a multi-day
        // block that started before rangeStart but extends into the visible
        // window was otherwise excluded entirely, silently showing its
        // opening days as available (Codex P2). Matches report-data.ts's
        // own scheduleBlock query.
        startsAt: {
          lte: rangeEnd,
        },
        endsAt: {
          gte: rangeStart,
        },
      },
      orderBy: {
        startsAt: "asc",
      },
    }),
    // Only need to know whether any client exists (to gate the booking CTA) —
    // don't load the whole client table to render the calendar.
    prisma.client.count({
      where: {
        businessId: business.id,
        isArchived: false,
      },
    }),
    prisma.staffMember.findMany({
      where: {
        businessId: business.id,
        isActive: true,
        status: {
          not: "INACTIVE",
        },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.businessHours.findMany({
      where: {
        businessId: business.id,
      },
      orderBy: {
        weekday: "asc",
      },
    }),
  ]);

  const initialView = buildCalendarViewFromRecords({
    appointments,
    scheduleBlocks,
    hasClients: clientCount > 0,
    staffMembers,
    businessHours,
    ownerName,
    initialDate: format(initialDate, "yyyy-MM-dd"),
    rangeStart,
    rangeEnd,
  });

  return (
    <CalendarWorkspace
      initialView={initialView}
      ownerName={ownerName}
    />
  );
}
