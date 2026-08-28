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
 * NOT a numeric ordinal either: an offset into the eligible-business list is
 * only meaningful if that list's membership never changes between runs. It
 * does — a business toggling WhatsApp on/off, or its connection flipping
 * CONNECTED/ERRORED, changes who's eligible on the very next run. Storing the
 * ID of the last-attempted business instead survives that: reminder-fairness.ts
 * resumes at the smallest remaining ID greater than this one, so a removed or
 * reordered business degrades to "skip one id," never "lose your place in
 * the rotation."
 *
 * Fails safe: without Redis configured or on a fault, the cursor reads as
 * null (start of the list) and writes are silently dropped. Every run then
 * starts from the same position — fairness is lost, correctness is not. A
 * missing safety net must never be the reason reminders stop sending.
 */

const CURSOR_KEY = "vela:reminder-cursor";

export async function getReminderCursor(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get<string>(CURSOR_KEY);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    noteRedisFailure();
    return null;
  }
}

export async function setReminderCursor(businessId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    // SET is denyoom-flagged — valid breaker-recovery evidence, see lib/redis.ts.
    await redis.set(CURSOR_KEY, businessId);
    noteRedisStoreSucceeded();
  } catch {
    noteRedisFailure();
  }
}
