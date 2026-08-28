/**
 * Fairness helpers for the reminders cron, kept in a prisma-free module so they
 * can be unit-tested. Importing `lib/reminders.ts` pulls in `lib/prisma.ts`,
 * whose top-level `getDatabaseUrl()` throws when no `.env` is present — which
 * is exactly how CI runs (see the PR that split `staff-clock-core.ts` out for
 * the same reason).
 */

/**
 * Whole UTC days since the epoch.
 *
 * UTC is deliberate: a local-time day index can repeat or skip a day across a
 * DST shift, which would stall or double-advance the rotation below.
 */
export function utcDayIndex(now: number = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

/**
 * Rotate a stably-ordered tenant list by the day so a budget-truncated run
 * doesn't skip the same tail forever.
 *
 * The reminders job stops at a wall-clock budget (Vercel Hobby caps functions
 * at 60s). Without rotation the cutoff always lands in the same place, and
 * because the cron runs only once daily those clinics would never send
 * reminders at all — not merely send them late. Advancing the start by one
 * tenant per day guarantees every tenant reaches the front within
 * `list.length` days.
 *
 * Unlike the analytics cron there is no staleness signal to sort by: a
 * reminder either goes out or it doesn't, and nothing records "last reached".
 * Rotation is the cheap equivalent that needs no extra persisted state.
 */
export function rotateForFairness<T>(list: readonly T[], dayIndex: number): T[] {
  if (list.length === 0) {
    return [];
  }

  // Double-modulo so a negative or non-integer `dayIndex` can't produce a
  // negative slice index and silently reorder the list into garbage.
  const normalized = Math.trunc(dayIndex);
  const offset = ((normalized % list.length) + list.length) % list.length;

  return [...list.slice(offset), ...list.slice(0, offset)];
}

/**
 * Order tenants by their most imminent due reminder, soonest first.
 *
 * Rotation alone can't prevent dropped reminders: a reminder window is at most
 * 24h and the cron runs once daily, so a tenant skipped on the single run
 * before an appointment can't recover by rotating forward — that appointment is
 * already past. Sending the soonest-due first means a budget-truncated run
 * drops the furthest-out reminders, which are still in the window next run.
 *
 * Pass an already-rotated list: the sort is stable, so tenants with no due
 * reminder (or identical urgency) keep the rotation's ordering and still take
 * turns rather than being ordered the same way forever.
 */
export function orderByReminderUrgency<T extends { id: string }>(
  rotated: readonly T[],
  soonestDueAt: ReadonlyMap<string, number>
): T[] {
  return [...rotated].sort(
    (a, b) =>
      (soonestDueAt.get(a.id) ?? NO_DUE_REMINDER) -
      (soonestDueAt.get(b.id) ?? NO_DUE_REMINDER)
  );
}

/**
 * Sentinel for "no reminder due", deliberately finite.
 *
 * `Infinity - Infinity` is `NaN`, and a comparator returning NaN silently
 * corrupts the sort order rather than failing loudly.
 */
export const NO_DUE_REMINDER = Number.MAX_SAFE_INTEGER;
