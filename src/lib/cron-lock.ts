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

/**
 * Try to take the named lock for `ttlSeconds`. Returns true if this call holds
 * it (proceed), false if another run already holds it (skip this run).
 */
export async function acquireCronLock(
  name: string,
  ttlSeconds: number
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    return true;
  }

  try {
    // NX: only set if absent. `SET` is denyoom-flagged (fails when Redis is
    // out of memory), so a completed one is valid breaker-recovery evidence —
    // same rule as the cache's SET, see lib/redis.ts.
    const result = await redis.set(LOCK_PREFIX + name, "1", {
      nx: true,
      ex: ttlSeconds,
    });
    noteRedisStoreSucceeded();
    return result !== null;
  } catch {
    noteRedisFailure();
    // Redis is degraded, not necessarily contended — proceed rather than
    // block a job that would otherwise run correctly.
    return true;
  }
}

/** Release the lock early so the next scheduled run doesn't wait out the TTL. */
export async function releaseCronLock(name: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    // Not reported as store evidence: DEL is not denyoom-flagged, so it keeps
    // succeeding even when the store is full — see lib/redis.ts.
    await redis.del(LOCK_PREFIX + name);
  } catch {
    // Best-effort: the TTL above is the real backstop if this never runs
    // (a crash, a killed function) — the lock still expires on its own.
    noteRedisFailure();
  }
}
