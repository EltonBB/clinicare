import { CHECK_IN_EARLY_GRACE_MS } from "@/lib/staff";

const MAX_OPEN_NO_SHIFT_MS = 12 * 60 * 60 * 1000;

type OpenEntry = {
  id: string;
  businessId: string;
  staffMemberId: string;
  checkedInAt: Date;
};

type CoveringShift = {
  businessId: string;
  staffMemberId: string;
  startsAt: Date;
  endsAt: Date;
};

/**
 * Pure scheduling core of `autoCloseStaleTimeEntries`: given the open entries, a
 * superset of candidate shifts, and `now`, decide which entries are past their
 * boundary and at what instant each should be closed — grouped by close instant
 * so the caller can issue one `updateMany` per boundary.
 *
 * An entry's boundary is the end of its covering shift (the earliest-ending
 * shift, scoped to the same business, whose window — with a 30-min early grace —
 * contains the check-in), or a 12-hour cap when no shift covers it. An entry not
 * yet past its boundary is a legitimately-open session and is left out of the
 * result.
 *
 * Lives in its own prisma-free module so it stays unit-testable without a
 * database: importing the DB-bound `staff-clock.ts` would pull in `@/lib/prisma`,
 * which requires `DATABASE_URL` at module load.
 */
export function planStaleEntryCloses(
  open: OpenEntry[],
  shifts: CoveringShift[],
  now: Date
): Map<number, string[]> {
  const shiftsByStaff = new Map<string, CoveringShift[]>();
  for (const shift of shifts) {
    const list = shiftsByStaff.get(shift.staffMemberId) ?? [];
    list.push(shift);
    shiftsByStaff.set(shift.staffMemberId, list);
  }

  // Group entries to close by their close instant, so the caller can write one
  // `updateMany` per distinct boundary (entries under the same shift share it).
  const closeGroups = new Map<number, string[]>();
  for (const entry of open) {
    // The shift the check-in belongs to (its 30-min early grace through its end),
    // earliest-ending first — identical selection to the former per-entry query.
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
    const closeAt =
      boundary > entry.checkedInAt ? boundary.getTime() : entry.checkedInAt.getTime();
    const group = closeGroups.get(closeAt) ?? [];
    group.push(entry.id);
    closeGroups.set(closeAt, group);
  }

  return closeGroups;
}
