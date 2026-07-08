import { prisma } from "@/lib/prisma";
import { CHECK_IN_EARLY_GRACE_MS } from "@/lib/staff";

import { planStaleEntryCloses } from "./staff-clock-core";

/**
 * Auto-close forgotten open check-ins.
 *
 * A staff member who checks in and never checks out would otherwise inflate
 * their weekly hours forever — `calculateWeeklyHours` counts an open time entry
 * up to "now". Each stale entry is closed at its natural boundary: the end of
 * the shift it was opened for, or a 12-hour cap when there's no covering shift
 * (see `planStaleEntryCloses` for that pure boundary logic).
 *
 * Runs in the daily reminders cron (global sweep) and opportunistically per
 * business on workspace render (mirrors `completePastConfirmedAppointments`).
 * Best-effort and idempotent — only entries already past their boundary close,
 * and a legitimately-open current session is left untouched.
 */
export async function autoCloseStaleTimeEntries(
  businessId?: string,
  now: Date = new Date()
): Promise<{ closed: number }> {
  const open = await prisma.staffTimeEntry.findMany({
    where: {
      checkedOutAt: null,
      ...(businessId ? { businessId } : {}),
    },
    select: { id: true, businessId: true, staffMemberId: true, checkedInAt: true },
    // Bounded: at any moment only currently-checked-in or forgotten entries are
    // open, a small set; the cap is a runaway guard, not an expected volume.
    take: 1000,
  });

  if (open.length === 0) {
    return { closed: 0 };
  }

  // Batch every covering-shift lookup into ONE query instead of a findFirst per
  // open entry (the global cron sweep could otherwise fire up to 1000 sequential
  // round-trips). Fetch a superset — every shift for the involved staff whose
  // window could overlap any open check-in — then match each entry precisely via
  // planStaleEntryCloses, reproducing the per-entry predicate exactly.
  const staffMemberIds = [...new Set(open.map((entry) => entry.staffMemberId))];
  let earliestCheckIn = open[0].checkedInAt.getTime();
  let latestCheckIn = earliestCheckIn;
  for (const entry of open) {
    const t = entry.checkedInAt.getTime();
    if (t < earliestCheckIn) earliestCheckIn = t;
    if (t > latestCheckIn) latestCheckIn = t;
  }

  const shifts = await prisma.staffShift.findMany({
    where: {
      staffMemberId: { in: staffMemberIds },
      startsAt: { lte: new Date(latestCheckIn + CHECK_IN_EARLY_GRACE_MS) },
      endsAt: { gte: new Date(earliestCheckIn) },
    },
    select: { businessId: true, staffMemberId: true, startsAt: true, endsAt: true },
  });

  const closeGroups = planStaleEntryCloses(open, shifts, now);

  let closed = 0;
  for (const [closeAtMs, ids] of closeGroups) {
    // Compare-and-set: only close entries still open at write time, so a real
    // check-out that landed between the read above and this write isn't
    // overwritten with the computed stale boundary. Count the rows actually
    // closed (updateMany returns the affected count).
    const { count } = await prisma.staffTimeEntry.updateMany({
      where: { id: { in: ids }, checkedOutAt: null },
      data: { checkedOutAt: new Date(closeAtMs) },
    });
    closed += count;
  }

  return { closed };
}
