import { USABLE_SUBSCRIPTION_STATUSES } from "@/lib/billing-access";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { getPaddleSubscription } from "./paddle-api";
import type { PaddleConfig } from "./paddle-config";
import { applySubscriptionSnapshot } from "./subscription-sync";

/** Re-read at most this many subscriptions per run (each is one API call). */
export const RECONCILE_BATCH = 25;

// A renewal's webhook normally lands within minutes of the period ending.
const GRACE_MS = 60 * 60 * 1000;

/**
 * Safety net for missed webhooks, in both directions: a clinic still shown as
 * trialing/paying after its period (or its scheduled cancellation) has passed
 * is re-read from Paddle and the fresh state applied. Without it a lost
 * renewal event would eventually look like a lapse, and a lost cancellation
 * would leave a clinic working for free.
 */
export async function reconcileOverdueSubscriptions(
  config: PaddleConfig,
  now: Date = new Date()
): Promise<{ checked: number; applied: number; failed: number }> {
  const overdueBefore = new Date(now.getTime() - GRACE_MS);
  const due = await prisma.business.findMany({
    where: {
      // A free clinic's leftover subscription is never synced (subscription-sync.ts).
      billingMode: "SUBSCRIPTION",
      paddleSubscriptionId: { not: null },
      subscriptionStatus: { in: [...USABLE_SUBSCRIPTION_STATUSES] },
      OR: [{ currentPeriodEndsAt: { lt: overdueBefore } }, { cancelAt: { lt: now } }],
    },
    select: { id: true, paddleSubscriptionId: true },
    orderBy: { currentPeriodEndsAt: "asc" },
    take: RECONCILE_BATCH,
  });

  let applied = 0;
  let failed = 0;
  for (const business of due) {
    if (!business.paddleSubscriptionId) continue;
    try {
      const subscription = await getPaddleSubscription(config, business.paddleSubscriptionId);
      // The API answer is the newest state there is, so it is dated now: any
      // older event still in flight then arrives stale and changes nothing.
      if ((await applySubscriptionSnapshot(config, subscription, now)) === "applied") applied += 1;
    } catch (error) {
      failed += 1;
      logger.error("Couldn't re-read a subscription from Paddle.", error, { businessId: business.id });
    }
  }
  return { checked: due.length, applied, failed };
}
