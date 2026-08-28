import { randomUUID } from "node:crypto";

import { getRedis, noteRedisFailure, noteRedisStoreSucceeded } from "@/lib/redis";

/**
 * Best-effort distributed lock so two overlapping cron invocations don't do
 * the same work twice. Vercel Cron does not serialize runs — if one is still
 * in flight when the next trigger fires, both execute concurrently. For
 * reminders that matters: a patient can receive the same WhatsApp message
 * twice if two runs both read an appointment as due before either has written
 * its SENT marker.
 *
 * Fails OPEN: without Redis configured (dev/test) or on a Redis fault, this
 * lets the job run unprotected rather than blocking it. A missing safety net
 * must never be the reason a cron job stops running — the underlying job's
 * own idempotency (an upsert keyed on a unique constraint) is still there.
 */

const LOCK_PREFIX = "vela:cron-lock:";

export type CronLockAcquisition = {
  /** Whether the caller should run the job — true on a real acquire OR a fail-open. */
  proceed: boolean;
  /**
   * Non-null ONLY when this invocation genuinely holds the lock (the SET NX
   * itself succeeded). Null on contention (nothing to release) AND on
   * fail-open (this invocation never verified it holds anything — see
   * releaseCronLock for why that distinction matters).
   */
  token: string | null;
};

/**
 * Try to take the named lock for `ttlSeconds`.
 */
export async function acquireCronLock(
  name: string,
  ttlSeconds: number
): Promise<CronLockAcquisition> {
  const redis = getRedis();
  if (!redis) {
    return { proceed: true, token: null };
  }

  // A per-acquisition token, not a constant — this is what lets release tell
  // "I hold this lock" apart from "someone else does," see releaseCronLock.
  const token = randomUUID();

  try {
    // NX: only set if absent. Redis evaluates the NX precondition (does the
    // key exist?) without attempting to allocate anything, so a contended
    // result (`null`) proves nothing about whether Redis can currently store
    // data — only a result of "OK" means the write itself went through.
    // Reporting contention as store evidence would let two lock probes that
    // both lose to contention — needing no memory at all — satisfy the
    // breaker's recovery threshold while Redis is still genuinely unable to
    // write, reopening traffic to a store that isn't actually healthy.
    const result = await redis.set(LOCK_PREFIX + name, token, {
      nx: true,
      ex: ttlSeconds,
    });
    if (result !== null) {
      noteRedisStoreSucceeded();
      return { proceed: true, token };
    }
    return { proceed: false, token: null };
  } catch {
    noteRedisFailure();
    // Redis is degraded, not necessarily contended — proceed rather than
    // block a job that would otherwise run correctly. This invocation never
    // confirmed it holds the lock, so it must not release anything later: if
    // another invocation genuinely holds it (this SET's response timed out
    // while a real holder's key was already there), a plain DEL here would
    // evict THEIR lock and let a third invocation start overlapping it.
    return { proceed: true, token: null };
  }
}

/**
 * Release the lock early so the next scheduled run doesn't wait out the TTL.
 * `token` must be the value returned by the `acquireCronLock` call that this
 * release corresponds to — pass null (fail-open, or never called) to skip.
 */
export async function releaseCronLock(name: string, token: string | null): Promise<void> {
  const redis = getRedis();
  if (!redis || token === null) {
    return;
  }

  try {
    // Compare-and-delete, not a plain DEL: only remove the key if it still
    // holds THIS invocation's token. Guards two cases a plain DEL would get
    // wrong — (1) the TTL expired and a different invocation already
    // acquired the key with a new token before this release ran, and (2) can
    // no longer arise now that fail-open returns token: null above, but the
    // guard is what makes that safe rather than merely convenient.
    await redis.eval<[string], number>(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      [LOCK_PREFIX + name],
      [token]
    );
  } catch {
    // Best-effort: the TTL above is the real backstop if this never runs
    // (a crash, a killed function) — the lock still expires on its own.
    noteRedisFailure();
  }
}
