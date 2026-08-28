import { hasTimeFor, QUERY_RESERVE_MS } from "@/lib/deadline";
import { prisma } from "@/lib/prisma";
import { CHECK_IN_EARLY_GRACE_MS } from "@/lib/staff";

import { planStaleEntryCloses } from "./staff-clock-core";

/** Runaway guard on a single sweep, not an expected volume. */
const OPEN_ENTRY_SCAN_LIMIT = 1000;

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
  now: Date = new Date(),
  /**
   * Optional absolute deadline (epoch ms). The sweep reads up to 1,000 open
   * entries and then issues one sequential `updateMany` per distinct close
   * boundary, so on a slow database or a large backlog it can run well past
   * its caller's budget. Gating only its START is not enough — callers under a
   * platform function cap pass this so it can stop BETWEEN groups.
   *
   * Stopping early is safe: whatever is left stays open and is closed by the
   * next run, whereas overrunning costs the caller its entire response.
   */
  deadlineAt?: number
): Promise<{ closed: number; incomplete: boolean }> {
  if (!hasTimeFor(deadlineAt, QUERY_RESERVE_MS)) {
    return { closed: 0, incomplete: true };
  }

  const open = await prisma.staffTimeEntry.findMany({
    where: {
      checkedOutAt: null,
      ...(businessId ? { businessId } : {}),
    },
    select: { id: true, businessId: true, staffMemberId: true, checkedInAt: true },
    // Bounded: at any moment only currently-checked-in or forgotten entries are
    // open, a small set; the cap is a runaway guard, not an expected volume.
    // One EXTRA row is fetched purely to detect that the cap was hit — without
    // it the sweep silently drops the remainder and still reports a completed
    // run, while those entries stay open and keep inflating tracked hours.
    take: OPEN_ENTRY_SCAN_LIMIT + 1,
  });

  // Truncated by the cap: process what we have and tell the caller more remain.
  // The probe row is dropped so it isn't closed out of order.
  const capReached = open.length > OPEN_ENTRY_SCAN_LIMIT;
  if (capReached) {
    open.length = OPEN_ENTRY_SCAN_LIMIT;
  }

  if (open.length === 0) {
    return { closed: 0, incomplete: false };
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

  // Between the reads: the first may have consumed what was left.
  if (!hasTimeFor(deadlineAt, QUERY_RESERVE_MS)) {
    return { closed: 0, incomplete: true };
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
  let incomplete = false;

  for (const [closeAtMs, ids] of closeGroups) {
    // Between groups, not mid-group: an interrupted `updateMany` would be a
    // partial write. Each group is one statement, so this is a clean boundary.
    // Reserve enough for that statement rather than merely checking the
    // deadline: at deadline-1ms the check would pass and the awaited write
    // could still run past the caller's budget.
    if (!hasTimeFor(deadlineAt, QUERY_RESERVE_MS)) {
      incomplete = true;
      break;
    }

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

  return { closed, incomplete: incomplete || capReached };
}
