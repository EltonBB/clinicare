import { getRedis, noteRedisFailure, noteRedisStoreSucceeded } from "@/lib/redis";

/**
 * Where the reminders job left off, so the next run resumes from the skipped
 * suffix instead of repeating the same prefix.
 *
 * NOT clock-based (e.g. "rotate by the current hour"): under sustained low
 * throughput — the exact scenario a run budget exists to survive — a fixed
 * per-hour advance barely moves. With 50 businesses and capacity for 3, an
 * hourly +1 offset only reaches business 49 after ~47 runs, by which time its
 * reminder window has long passed. Advancing by the actual count attempted
 * each run is what makes "retried next time" true regardless of throughput.
 *
 * Fails safe: without Redis configured or on a fault, the cursor reads as 0
 * and writes are silently dropped. Every run then starts from the same
 * position — fairness is lost, correctness is not. A missing safety net must
 * never be the reason reminders stop sending.
 */

const CURSOR_KEY = "vela:reminder-cursor";

export async function getReminderCursor(): Promise<number> {
  const redis = getRedis();
  if (!redis) {
    return 0;
  }

  try {
    const raw = await redis.get<number>(CURSOR_KEY);
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  } catch {
    noteRedisFailure();
    return 0;
  }
}

export async function setReminderCursor(value: number): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    // SET is denyoom-flagged — valid breaker-recovery evidence, see lib/redis.ts.
    await redis.set(CURSOR_KEY, value);
    noteRedisStoreSucceeded();
  } catch {
    noteRedisFailure();
  }
}
