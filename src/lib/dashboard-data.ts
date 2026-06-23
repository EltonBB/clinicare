import { prisma } from "@/lib/prisma";
import { getAppTimeZone } from "@/lib/time-zone";
import type { DashboardAppointmentAggregates } from "@/lib/dashboard";

/**
 * Aggregate the dashboard's appointment metrics in Postgres instead of fetching
 * the analytics window's rows and reducing them in JS. Returns scalar counts +
 * per-day visit buckets, so the page ships a handful of rows regardless of how
 * many appointments a clinic has.
 *
 * Parity with the previous JS logic:
 * - completion split / completed-this-month: status counts over the same windows
 * - average duration: TRUNC(epoch/60) per row (matches date-fns differenceInMinutes,
 *   which truncates) clamped at 0, then AVG + ROUND
 * - visit buckets: non-cancelled, grouped by app-zone calendar day (YYYY-MM-DD),
 *   matching formatZonedDateKey
 */
export async function getDashboardAppointmentAggregates(args: {
  businessId: string;
  recentWindowStart: Date;
  monthStart: Date;
  todayEnd: Date;
  timeZone?: string;
}): Promise<DashboardAppointmentAggregates> {
  const { businessId, recentWindowStart, monthStart, todayEnd } = args;
  const timeZone = args.timeZone ?? getAppTimeZone();

  const [statusCounts, completedThisMonth, avgRows, buckets] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["status"],
      where: {
        businessId,
        startAt: { gte: recentWindowStart, lte: todayEnd },
      },
      _count: { _all: true },
    }),
    prisma.appointment.count({
      where: {
        businessId,
        status: "COMPLETED",
        startAt: { gte: monthStart, lte: todayEnd },
      },
    }),
    prisma.$queryRaw<Array<{ avg_minutes: number | null }>>`
      SELECT ROUND(AVG(GREATEST(TRUNC(EXTRACT(EPOCH FROM ("endAt" - "startAt")) / 60), 0)))::int AS avg_minutes
      FROM "Appointment"
      WHERE "businessId" = ${businessId}
        AND "status" = 'COMPLETED'
        AND "startAt" >= ${recentWindowStart}
        AND "startAt" <= ${todayEnd}
    `,
    // startAt is `timestamp without time zone` holding the UTC instant (Prisma's
    // default mapping). Re-interpret it as UTC, then convert to the app zone, so
    // the day key is the app-zone calendar day — matching formatZonedDateKey.
    // A plain `AT TIME ZONE ${timeZone}` would mis-bucket instants near midnight.
    prisma.$queryRaw<Array<{ key: string; count: number }>>`
      SELECT to_char(date_trunc('day', ("startAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}), 'YYYY-MM-DD') AS key,
             count(*)::int AS count
      FROM "Appointment"
      WHERE "businessId" = ${businessId}
        AND "startAt" >= ${recentWindowStart}
        AND "startAt" <= ${todayEnd}
        AND "status" <> 'CANCELLED'
      GROUP BY key
    `,
  ]);

  const recentCompleted =
    statusCounts.find((row) => row.status === "COMPLETED")?._count._all ?? 0;
  const recentCancelled =
    statusCounts.find((row) => row.status === "CANCELLED")?._count._all ?? 0;

  return {
    recentCompleted,
    recentCancelled,
    completedThisMonth,
    averageDurationMinutes: avgRows[0]?.avg_minutes ?? 0,
    visitCountsByDay: buckets,
  };
}
