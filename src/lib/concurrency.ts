/**
 * Run `fn` over `items` with at most `limit` promises in flight at once,
 * preserving input order in the results.
 *
 * Used to bound per-tenant fan-out in cron jobs: a sequential `for await` loop
 * serializes every tenant, so one slow tenant (e.g. a hung external call) can
 * push the whole batch past the function timeout and starve later tenants.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

const TIMED_OUT: unique symbol = Symbol("with-deadline-timed-out");

/**
 * Race `work` against `timeoutMs`. On timeout, `onTimeout()` supplies the
 * fallback return value — `work` is NOT cancelled (promises can't be; a
 * Prisma call or fetch already in flight keeps running with no abort handle),
 * only given up on, so its eventual settlement is swallowed.
 *
 * Two type parameters, not one: callers commonly return differently-shaped
 * literal-discriminated objects from the success and timeout branches (e.g.
 * `timedOut: false` vs `timedOut: true`). Forcing both through a single T
 * makes the timeout branch a type error — TS unifies T from the first
 * argument, then rejects the second as not assignable to it.
 */
export async function withDeadline<T, F>(
  work: Promise<T>,
  timeoutMs: number,
  onTimeout: () => F
): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });

  try {
    const result = await Promise.race([work, timeout]);
    if (result === TIMED_OUT) {
      void work.catch(() => {});
      return onTimeout();
    }
    return result as T;
  } finally {
    // clearTimeout accepts undefined as a no-op — no guard needed.
    clearTimeout(timer);
  }
}
