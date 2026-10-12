import { prisma } from "@/lib/prisma";
import type { StaffDirectoryCounts } from "@/lib/staff";

/**
 * Per-staff appointment counts for the directory, aggregated in the DB so the
 * page never loads every appointment per member. Mirrors the in-memory logic in
 * staff.ts exactly: completionRate is over appointments since `completionCutoff`,
 * completed/(completed+cancelled+no-show).
 */
export async function getStaffDirectoryCounts(args: {
  businessId: string;
  completionCutoff: Date;
}): Promise<Map<string, StaffDirectoryCounts>> {
  const { businessId, completionCutoff } = args;

  const completionRows = await prisma.appointment.groupBy({
    by: ["staffMemberId", "status"],
    where: {
      businessId,
      staffMemberId: { not: null },
      startAt: { gte: completionCutoff },
    },
    _count: { _all: true },
  });

  const map = new Map<string, StaffDirectoryCounts>();
  const ensure = (id: string): StaffDirectoryCounts => {
    let entry = map.get(id);
    if (!entry) {
      entry = { completionRate: 0 };
      map.set(id, entry);
    }
    return entry;
  };

  // A no-show is a finalized visit that wasn't completed, same as a cancellation.
  const finalized = new Map<string, { completed: number; missed: number }>();
  for (const row of completionRows) {
    if (!row.staffMemberId) continue;
    const agg = finalized.get(row.staffMemberId) ?? { completed: 0, missed: 0 };
    if (row.status === "COMPLETED") agg.completed += row._count._all;
    else if (row.status === "CANCELLED" || row.status === "NO_SHOW") agg.missed += row._count._all;
    finalized.set(row.staffMemberId, agg);
  }
  for (const [id, agg] of finalized) {
    const total = agg.completed + agg.missed;
    // Matches calculateCompletionRate: one-decimal percentage.
    ensure(id).completionRate =
      total > 0 ? Math.round((agg.completed / total) * 1000) / 10 : 0;
  }

  return map;
}

/**
 * Per-staff unread count in the staff↔admin thread (e.g. a mobile-side
 * cancellation notice), for the directory's unread indicator. Uses a summing
 * aggregate (not findFirst) as defense-in-depth: the @@unique([businessId,
 * staffMemberId]) constraint on StaffThread (enforced via ensureAdminThread's
 * upsert) makes a second thread per staff member impossible today, but this
 * stays resilient to any future write path that creates a StaffThread outside
 * ensureAdminThread.
 */
export async function getStaffUnreadMessageCounts(
  businessId: string
): Promise<Map<string, number>> {
  const rows = await prisma.staffThread.groupBy({
    by: ["staffMemberId"],
    where: { businessId, unreadForAdmin: { gt: 0 } },
    _sum: { unreadForAdmin: true },
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.staffMemberId, row._sum.unreadForAdmin ?? 0);
  }
  return map;
}

/**
 * Per-staff count of check-ins the admin hasn't viewed yet
 * (StaffTimeEntry.seenByAdminAt still null). Feeds the directory row dot so
 * it agrees with the Staff nav dot (app-shell.tsx), which fires for this same
 * signal — otherwise clicking the nav dot could land on a directory with no
 * row indicating who triggered it.
 */
export async function getStaffUnseenCheckInCounts(
  businessId: string
): Promise<Map<string, number>> {
  const rows = await prisma.staffTimeEntry.groupBy({
    by: ["staffMemberId"],
    where: { businessId, seenByAdminAt: null },
    _count: { _all: true },
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.staffMemberId, row._count._all);
  }
  return map;
}
