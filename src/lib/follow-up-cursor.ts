import { getRedis, noteRedisFailure, noteRedisStoreSucceeded } from "@/lib/redis";

/**
 * Where the follow-up generation job left off, so a budget-truncated run
 * doesn't skip the same suffix of businesses forever — the exact fairness
 * problem reminder-cursor.ts solves for the reminders cron, reused here
 * rather than duplicated: without it, a business's own ascending id order
 * combined with a fixed time budget means whichever businesses sort last
 * lose the deadline race on EVERY run, not just deferred to "next time" as
 * the stop-early warning implies (Codex #130).
 *
 * A separate key from the reminders cursor: these are two independent crons,
 * each rotating its own eligible-business list at its own pace.
 */
const CURSOR_KEY = "vela:follow-up-cursor";
// Same rotation for the automatic sends (api/cron/automations).
const AUTOMATIONS_CURSOR_KEY = "vela:automations-cursor";

async function readCursor(key: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get<string>(key);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    noteRedisFailure();
    return null;
  }
}

async function writeCursor(key: string, businessId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    await redis.set(key, businessId);
    noteRedisStoreSucceeded();
  } catch {
    noteRedisFailure();
  }
}

export function getFollowUpCursor(): Promise<string | null> {
  return readCursor(CURSOR_KEY);
}

export function setFollowUpCursor(businessId: string): Promise<void> {
  return writeCursor(CURSOR_KEY, businessId);
}

export function getAutomationsCursor(): Promise<string | null> {
  return readCursor(AUTOMATIONS_CURSOR_KEY);
}

export function setAutomationsCursor(businessId: string): Promise<void> {
  return writeCursor(AUTOMATIONS_CURSOR_KEY, businessId);
}
