import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { buildCalendarViewFromRecords } from "@/lib/calendar";
import { loadCalendarMonthRecords } from "@/lib/calendar-data";
import { isValidMonthKey } from "@/lib/calendar-range";
import { formatZonedDateKey } from "@/lib/time-zone";
import { redirect } from "next/navigation";
import { isValid, parseISO } from "date-fns";

// A real calendar date in `YYYY-MM-DD` form — the shape check alone lets through
// impossible dates like 2026-02-31, which would crash the workspace.
function isValidDateParam(value?: string): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isValid(parseISO(value)) &&
    isValidMonthKey(value.slice(0, 7))
  );
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
  // The real today in the clinic's zone — kept apart from the date being viewed,
  // so a `?date=` link (where saving a booking sends you) never redefines "today".
  const todayKey = formatZonedDateKey(new Date());
  const initialDate = isValidDateParam(requestedDate) ? requestedDate : todayKey;

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

  // Only the viewed month's grid is loaded up front (every status, completed
  // visits included); the workspace fetches any other month when navigated to.
  const [month, clientCount, staffMembers, businessHours] = await Promise.all([
    loadCalendarMonthRecords({ businessId: business.id, monthKey: initialDate.slice(0, 7) }),
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

  // initialDate is validated above, so its month key is always valid.
  if (!month) {
    throw new Error("Calendar month could not be resolved.");
  }

  const initialView = buildCalendarViewFromRecords({
    appointments: month.appointments,
    scheduleBlocks: month.scheduleBlocks,
    hasClients: clientCount > 0,
    staffMembers,
    businessHours,
    ownerName,
    initialDate,
    rangeStart: month.rangeStart,
    rangeEnd: month.rangeEnd,
  });

  return (
    <CalendarWorkspace
      initialView={initialView}
      initialRange={month.range}
      today={todayKey}
    />
  );
}
