/**
 * Fairness helper for the reminders cron, kept in a prisma-free module so it
 * can be unit-tested. Importing `lib/reminders.ts` pulls in `lib/prisma.ts`,
 * whose top-level `getDatabaseUrl()` throws when no `.env` is present — which
 * is exactly how CI runs.
 */

/**
 * Rotate a stably-ordered list so a budget-truncated run doesn't skip the
 * same suffix forever. The reminders job stops at a wall-clock budget;
 * without rotation the cutoff always lands in the same place in the
 * (stably-ordered) business list, so whichever businesses sort last lose the
 * deadline race on EVERY run — not "retried next time" as a bare skip counter
 * implies, but starved indefinitely for as long as the run stays
 * budget-constrained.
 *
 * `offset` should be a PERSISTED cursor advanced by however many businesses
 * were actually attempted last run (see reminder-cursor.ts), not a clock
 * value. A fixed per-run advance is insufficient under sustained low
 * throughput — with 50 businesses and capacity for 3, an hourly +1 offset
 * only reaches the 47th business after ~47 runs, well past any reminder
 * window. Advancing by the real attempted count is what makes each run
 * resume at the actual skipped suffix regardless of how much throughput any
 * given run had.
 */
export function rotateForFairness<T>(list: readonly T[], offset: number): T[] {
  if (list.length === 0) {
    return [];
  }

  // Double-modulo so a negative or non-integer offset can't produce a
  // negative slice index and silently reorder the list into garbage.
  const normalized = Math.trunc(offset);
  const boundedOffset = ((normalized % list.length) + list.length) % list.length;

  return [...list.slice(boundedOffset), ...list.slice(0, boundedOffset)];
}
