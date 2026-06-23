import { prisma } from "@/lib/prisma";
import type { StaffDirectoryCounts } from "@/lib/staff";

/**
 * Per-staff appointment counts for the directory, aggregated in the DB so the
 * page never loads every appointment per member. Mirrors the in-memory logic in
 * staff.ts exactly, including its (intentional) mix of windows:
 * - completionRate: over appointments since `completionCutoff`, completed/(completed+cancelled)
 * - completedThisMonth: COMPLETED within the app-zone month window
 * - appointmentsToday: any status within the app-zone day window
 */
export async function getStaffDirectoryCounts(args: {
  businessId: string;
  completionCutoff: Date;
  monthStart: Date;
  monthEnd: Date;
  todayStart: Date;
  todayEnd: Date;
}): Promise<Map<string, StaffDirectoryCounts>> {
  const { businessId, completionCutoff, monthStart, monthEnd, todayStart, todayEnd } = args;

  const [completionRows, monthRows, todayRows] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["staffMemberId", "status"],
      where: {
        businessId,
        staffMemberId: { not: null },
        startAt: { gte: completionCutoff },
      },
      _count: { _all: true },
    }),
    prisma.appointment.groupBy({
      by: ["staffMemberId"],
      where: {
        businessId,
        staffMemberId: { not: null },
        status: "COMPLETED",
        startAt: { gte: monthStart, lte: monthEnd },
      },
      _count: { _all: true },
    }),
    prisma.appointment.groupBy({
      by: ["staffMemberId"],
      where: {
        businessId,
        staffMemberId: { not: null },
        startAt: { gte: todayStart, lte: todayEnd },
      },
      _count: { _all: true },
    }),
  ]);

  const map = new Map<string, StaffDirectoryCounts>();
  const ensure = (id: string): StaffDirectoryCounts => {
    let entry = map.get(id);
    if (!entry) {
      entry = { appointmentsToday: 0, completionRate: 0, completedThisMonth: 0 };
      map.set(id, entry);
    }
    return entry;
  };

  const finalized = new Map<string, { completed: number; cancelled: number }>();
  for (const row of completionRows) {
    if (!row.staffMemberId) continue;
    const agg = finalized.get(row.staffMemberId) ?? { completed: 0, cancelled: 0 };
    if (row.status === "COMPLETED") agg.completed += row._count._all;
    else if (row.status === "CANCELLED") agg.cancelled += row._count._all;
    finalized.set(row.staffMemberId, agg);
  }
  for (const [id, agg] of finalized) {
    const total = agg.completed + agg.cancelled;
    // Matches calculateCompletionRate: one-decimal percentage.
    ensure(id).completionRate =
      total > 0 ? Math.round((agg.completed / total) * 1000) / 10 : 0;
  }

  for (const row of monthRows) {
    if (!row.staffMemberId) continue;
    ensure(row.staffMemberId).completedThisMonth = row._count._all;
  }

  for (const row of todayRows) {
    if (!row.staffMemberId) continue;
    ensure(row.staffMemberId).appointmentsToday = row._count._all;
  }

  return map;
}
