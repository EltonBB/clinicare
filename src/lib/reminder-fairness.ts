/**
 * Fairness helper for the reminders cron, kept in a prisma-free module so it
 * can be unit-tested. Importing `lib/reminders.ts` pulls in `lib/prisma.ts`,
 * whose top-level `getDatabaseUrl()` throws when no `.env` is present — which
 * is exactly how CI runs.
 */

/** Whole UTC hours since the epoch — deliberately wall-clock, not a persisted counter. */
export function utcHourIndex(now: number = Date.now()): number {
  return Math.floor(now / 3_600_000);
}

/**
 * Rotate a stably-ordered list so a budget-truncated run doesn't skip the
 * same tail forever. The reminders job stops at a wall-clock budget; without
 * rotation the cutoff always lands in the same place in the (stably-ordered)
 * business list, so whichever businesses sort last lose the deadline race on
 * EVERY hourly run — not "retried next hour" as a bare skip counter implies,
 * but starved indefinitely for as long as the run stays budget-constrained.
 * Rotating by the current hour bounds the worst case to `list.length` hours
 * instead: every business reaches the front of the queue within one cycle.
 */
export function rotateForFairness<T>(list: readonly T[], hourIndex: number): T[] {
  if (list.length === 0) {
    return [];
  }

  // Double-modulo so a negative or non-integer hourIndex can't produce a
  // negative slice index and silently reorder the list into garbage.
  const normalized = Math.trunc(hourIndex);
  const offset = ((normalized % list.length) + list.length) % list.length;

  return [...list.slice(offset), ...list.slice(0, offset)];
}
