import { prisma } from "@/lib/prisma";
import { CHECK_IN_EARLY_GRACE_MS } from "@/lib/staff";

/**
 * Auto-close forgotten open check-ins.
 *
 * A staff member who checks in and never checks out would otherwise inflate
 * their weekly hours forever — `calculateWeeklyHours` counts an open time entry
 * up to "now". Each stale entry is closed at its natural boundary: the end of
 * the shift it was opened for, or a 12-hour cap when there's no covering shift.
 *
 * Runs in the daily reminders cron (global sweep) and opportunistically per
 * business on workspace render (mirrors `completePastConfirmedAppointments`).
 * Best-effort and idempotent — only entries already past their boundary close,
 * and a legitimately-open current session is left untouched.
 */
const MAX_OPEN_NO_SHIFT_MS = 12 * 60 * 60 * 1000;

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
  // window could overlap any open check-in — then match each entry precisely in
  // memory below, reproducing the per-entry predicate exactly.
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

  const shiftsByStaff = new Map<string, typeof shifts>();
  for (const shift of shifts) {
    const list = shiftsByStaff.get(shift.staffMemberId) ?? [];
    list.push(shift);
    shiftsByStaff.set(shift.staffMemberId, list);
  }

  // Collect entries to close, grouped by their close instant, so we can write one
  // `updateMany` per distinct boundary (entries under the same shift share it).
  const closeGroups = new Map<number, string[]>();
  for (const entry of open) {
    // The shift the check-in belongs to (its 30-min early grace through its end),
    // earliest-ending first — identical selection to the former findFirst.
    const graceLimit = entry.checkedInAt.getTime() + CHECK_IN_EARLY_GRACE_MS;
    const shift = (shiftsByStaff.get(entry.staffMemberId) ?? [])
      .filter(
        (candidate) =>
          candidate.businessId === entry.businessId &&
          candidate.startsAt.getTime() <= graceLimit &&
          candidate.endsAt.getTime() >= entry.checkedInAt.getTime()
      )
      .sort((left, right) => left.endsAt.getTime() - right.endsAt.getTime())[0];

    const boundary = shift
      ? shift.endsAt
      : new Date(entry.checkedInAt.getTime() + MAX_OPEN_NO_SHIFT_MS);

    if (now.getTime() <= boundary.getTime()) {
      continue; // still within the shift / cap — a legitimately open session
    }

    // Never record a checkout before the check-in (clamp defensively).
    const closeAt = boundary > entry.checkedInAt ? boundary.getTime() : entry.checkedInAt.getTime();
    const group = closeGroups.get(closeAt) ?? [];
    group.push(entry.id);
    closeGroups.set(closeAt, group);
  }

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
