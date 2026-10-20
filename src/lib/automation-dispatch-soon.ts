import { after } from "next/server";

import { logger } from "@/lib/logger";

/**
 * Sends a workspace's just-made automatic drafts right after the current
 * request has responded (and so after its transaction committed), instead of
 * waiting for the next 5-minute automations run. Safe to call from inside a
 * transaction: if it rolls back, there is simply nothing new to send.
 *
 * Outside a request (a cron or a script) `after` is unavailable; the
 * automations cron sends those drafts on its next run, so nothing is lost.
 * The dispatcher is imported lazily: it depends on modules (slot offers) that
 * call this, and a static import would make them import each other.
 */
export function dispatchSoon(businessId: string): void {
  try {
    after(async () => {
      try {
        const { dispatchRecentAutomaticDrafts } = await import("@/lib/follow-up-dispatch");
        await dispatchRecentAutomaticDrafts(businessId);
      } catch (error) {
        logger.error("Sending a new automatic message right away failed; the next run will send it.", error, {
          businessId,
        });
      }
    });
  } catch {
    // Not inside a request: the automations cron picks the draft up.
  }
}
