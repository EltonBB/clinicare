import { subDays } from "date-fns";

import { prisma } from "@/lib/prisma";
import { getAppTimeZone, getZonedDayWindow } from "@/lib/time-zone";

export async function getReportWorkspaceData(
  businessId: string,
  range?: { start: Date; end: Date }
) {
  const now = new Date();
  const timeZone = getAppTimeZone();
  const defaultStart = getZonedDayWindow(subDays(now, 209), timeZone).start;
  const defaultEnd = getZonedDayWindow(now, timeZone).end;
  // A custom range needs its own comparison ("previous") period fetched too
  // — buildReportsViewFromWorkspace builds that as the same-length window
  // immediately before range.start — so the fetch boundary must reach back
  // that far, not just to range.start itself, or a custom range whose
  // comparison period predates the default 209-day lookback silently omits
  // appointments/messages/ScheduleBlocks from its own comparison interval.
  // A missing ScheduleBlock is the most dangerous case: it reads as capacity
  // that was never actually bookable (Codex P2).
  const customRangeStart = range
    ? new Date(
        range.start.getTime() -
          Math.max(range.end.getTime() - range.start.getTime(), 86_400_000)
      )
    : undefined;
  const reportStart =
    customRangeStart && customRangeStart < defaultStart ? customRangeStart : defaultStart;
  const reportEnd = range?.end && range.end > defaultEnd ? range.end : defaultEnd;

  const [
    business,
    appointments,
    clients,
    messages,
    businessHours,
    scheduleBlocks,
    staffMembers,
    conversations,
    clientStatusCounts,
  ] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: {
        id: businessId,
      },
      select: {
        id: true,
        name: true,
        businessType: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        businessId,
        startAt: {
          gte: reportStart,
          lte: reportEnd,
        },
      },
      select: {
        status: true,
        startAt: true,
        endAt: true,
        createdAt: true,
        clientId: true,
        staffMemberId: true,
      },
    }),
    // Only clients created within the report window — all per-period and chart
    // "new clients" counts filter to sub-windows of this range, so this is
    // equivalent to loading the whole table but bounded by time. Point-in-time
    // client composition comes from the aggregate below, not these rows.
    prisma.client.findMany({
      where: {
        businessId,
        createdAt: {
          gte: reportStart,
          lte: reportEnd,
        },
      },
      select: {
        createdAt: true,
        isArchived: true,
      },
    }),
    prisma.message.findMany({
      where: {
        sentAt: {
          gte: reportStart,
          lte: reportEnd,
        },
        conversation: {
          businessId,
        },
      },
      select: {
        direction: true,
        sentAt: true,
      },
    }),
    prisma.businessHours.findMany({
      where: {
        businessId,
      },
      select: {
        weekday: true,
        isOpen: true,
        startTime: true,
        endTime: true,
      },
    }),
    // Business-wide blocked-off time — subtracted from capacity in
    // buildCapacityMinutes since nothing can be booked into it regardless of
    // BusinessHours saying the day is otherwise open.
    prisma.scheduleBlock.findMany({
      where: {
        businessId,
        startsAt: {
          lte: reportEnd,
        },
        endsAt: {
          gte: reportStart,
        },
      },
      select: {
        startsAt: true,
        endsAt: true,
      },
    }),
    prisma.staffMember.findMany({
      where: {
        businessId,
      },
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
        isActive: true,
      },
    }),
    prisma.conversation.findMany({
      where: {
        businessId,
      },
      select: {
        unreadCount: true,
      },
    }),
    // Point-in-time client composition as a bounded aggregate (a handful of
    // rows) instead of loading the entire client table into memory.
    prisma.client.groupBy({
      by: ["status", "isArchived"],
      where: {
        businessId,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  // Mirror the original per-client bucketing exactly (archived wins over status,
  // then at-risk, then inactive, else active) so downstream values are identical.
  const clientMix = clientStatusCounts.reduce(
    (mix, row) => {
      const count = row._count._all;

      if (row.isArchived || row.status === "ARCHIVED") {
        mix.archived += count;
      } else if (row.status === "AT_RISK") {
        mix.atRisk += count;
      } else if (row.status === "INACTIVE") {
        mix.inactive += count;
      } else {
        mix.active += count;
      }

      return mix;
    },
    { active: 0, atRisk: 0, inactive: 0, archived: 0 }
  );

  return {
    business,
    appointments,
    clients,
    messages,
    businessHours,
    scheduleBlocks,
    staffMembers,
    conversations,
    clientMix,
  };
}
