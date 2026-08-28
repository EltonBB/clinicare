/**
 * Fairness helpers for the reminders cron, kept in a prisma-free module so
 * they can be unit-tested. Importing `lib/reminders.ts` pulls in
 * `lib/prisma.ts`, whose top-level `getDatabaseUrl()` throws when no `.env`
 * is present — which is exactly how CI runs.
 */

/**
 * Rotate a list — sorted ascending by `id`, as the caller's `orderBy: { id:
 * "asc" }` guarantees — so a budget-truncated run doesn't skip the same
 * suffix forever. The reminders job stops at a wall-clock budget; without
 * rotation the cutoff always lands in the same place, so whichever
 * businesses sort last lose the deadline race on EVERY run — not "retried
 * next time" as a bare skip counter implies, but starved indefinitely for as
 * long as the run stays budget-constrained.
 *
 * `afterId` should be the id of the last business ATTEMPTED last run (see
 * reminder-cursor.ts) — resuming strictly after it, not the offset of a
 * position. An ordinal position is only meaningful if the list's membership
 * never changes between runs; it does (a business toggling WhatsApp, or its
 * connection flipping CONNECTED/ERRORED, changes who's eligible on the very
 * next run), and a stale ordinal then skips whoever was actually next. Using
 * the smallest remaining id greater than `afterId` instead degrades a
 * membership change to "skip nothing" or "skip the one id that's gone,"
 * never "lose an entire lap."
 */
export function rotateForFairness<T extends { id: string }>(
  list: readonly T[],
  afterId: string | null
): T[] {
  if (list.length === 0) {
    return [];
  }
  if (afterId === null) {
    return [...list];
  }

  const index = list.findIndex((item) => item.id > afterId);
  if (index === -1) {
    // afterId was the last id in the list (or beyond it, if that business is
    // now gone) — nothing remains after it, so wrap to the start.
    return [...list];
  }

  return [...list.slice(index), ...list.slice(0, index)];
}

/**
 * The id to persist as next run's `afterId`, given how many businesses (from
 * the front of this run's rotated order) were actually given a turn.
 * `attemptedCount` is `progress.total - progress.skipped` — every business
 * that started (succeeded, failed, or threw), not just the ones that sent
 * cleanly; only a deadline-skip never got a turn at all.
 *
 * Returns null when nothing was attempted (an immediately-exhausted budget,
 * or an empty list) — the caller should leave the persisted cursor
 * untouched rather than write a value, exactly like the old "advance by 0"
 * case: next run resumes from the same place.
 */
export function lastAttemptedId<T extends { id: string }>(
  orderedList: readonly T[],
  attemptedCount: number
): string | null {
  if (attemptedCount <= 0 || attemptedCount > orderedList.length) {
    return null;
  }

  return orderedList[attemptedCount - 1]!.id;
}
