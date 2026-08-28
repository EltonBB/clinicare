/**
 * Deadline helpers for the budgeted cron routes.
 *
 * Under a hard platform function cap, being killed is worse than stopping: a
 * kill loses the HTTP response, so the caller can't tell a saturated run from a
 * crash. `hasTimeFor` guards each I/O boundary; `withDeadline` is the backstop
 * that still returns a partial result if a guard was missed.
 */

/** Milliseconds left, or `Infinity` when no deadline applies. */
function remainingMs(deadlineAt: number | undefined, now = Date.now()): number {
  return deadlineAt === undefined ? Number.POSITIVE_INFINITY : deadlineAt - now;
}

/**
 * Is there room to START an operation needing `reserveMs`?
 *
 * Always reserve the operation's WORST case, never just compare against the
 * deadline: a bare `now < deadlineAt` passes at deadline-1ms and then awaits
 * something that runs long past it — which is the whole failure this guards.
 */
export function hasTimeFor(
  deadlineAt: number | undefined,
  reserveMs: number,
  now = Date.now()
): boolean {
  return remainingMs(deadlineAt, now) >= reserveMs;
}

/**
 * Resolve `work`, or fall back to `onTimeout()` if the deadline passes first.
 *
 * The backstop of last resort. Interior guards should normally stop the work
 * before this fires; when one is missed, this still yields a response instead
 * of letting the platform kill the function silently.
 *
 * The losing promise is NOT cancelled — it cannot be, since a Prisma call in
 * flight has no abort handle. It is left to settle and its rejection swallowed,
 * so a late failure can't surface as an unhandled rejection after the response
 * has already been sent.
 */
export async function withDeadline<T>(
  work: Promise<T>,
  deadlineAt: number | undefined,
  onTimeout: () => T
): Promise<T> {
  if (deadlineAt === undefined) {
    return work;
  }

  // No `left <= 0` shortcut: a 0ms timer is a macrotask, so work that had
  // ALREADY resolved still wins the race on the microtask queue. Short-circuiting
  // would discard it. Clamped at 0 because a negative delay is a Node warning.
  const left = Math.max(remainingMs(deadlineAt), 0);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), left);
  });

  try {
    const result = await Promise.race([work, timeout]);
    if (result === TIMED_OUT) {
      void work.catch(() => {});
      return onTimeout();
    }
    return result as T;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Room for one database operation. Every I/O boundary in the cron paths
 * reserves this or a multiple of it, rather than each site inventing its own.
 */
export const QUERY_RESERVE_MS = 5_000;

/** Unique sentinel so a legitimate `work` value can never be mistaken for it. */
const TIMED_OUT: unique symbol = Symbol("deadline-timed-out");
