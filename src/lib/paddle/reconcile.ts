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
 * would leave a clinic working for free. Paused subscriptions have no period
 * to run out, so they are re-read too, with the room the overdue ones leave:
 * a missed `resumed` event would otherwise keep the clinic read-only for good.
 */
export async function reconcileOverdueSubscriptions(
  config: PaddleConfig,
  now: Date = new Date()
): Promise<{ checked: number; applied: number; failed: number }> {
  const overdueBefore = new Date(now.getTime() - GRACE_MS);
  // A free clinic's leftover subscription is never synced (subscription-sync.ts).
  const synced = { billingMode: "SUBSCRIPTION" as const, paddleSubscriptionId: { not: null } };
  const select = { id: true, paddleSubscriptionId: true };
  const overdue = await prisma.business.findMany({
    where: {
      ...synced,
      subscriptionStatus: { in: [...USABLE_SUBSCRIPTION_STATUSES] },
      OR: [{ currentPeriodEndsAt: { lt: overdueBefore } }, { cancelAt: { lt: now } }],
    },
    select,
    orderBy: { currentPeriodEndsAt: "asc" },
    take: RECONCILE_BATCH,
  });
  const paused =
    overdue.length < RECONCILE_BATCH
      ? await prisma.business.findMany({
          where: { ...synced, subscriptionStatus: "PAUSED" },
          select,
          orderBy: { billingSyncedAt: "asc" },
          take: RECONCILE_BATCH - overdue.length,
        })
      : [];
  const due = [...overdue, ...paused];

  let applied = 0;
  let failed = 0;
  for (const business of due) {
    if (!business.paddleSubscriptionId) continue;
    try {
      const subscription = await getPaddleSubscription(config, business.paddleSubscriptionId);
      // Dated by Paddle's own last change, not when this run started: an event
      // older than the state read then arrives stale and changes nothing.
      const changedAt = subscription.updated_at ? new Date(subscription.updated_at) : null;
      const observedAt = changedAt && !Number.isNaN(changedAt.getTime()) ? changedAt : now;
      if ((await applySubscriptionSnapshot(config, subscription, observedAt)) === "applied") applied += 1;
    } catch (error) {
      failed += 1;
      logger.error("Couldn't re-read a subscription from Paddle.", error, { businessId: business.id });
    }
  }
  return { checked: due.length, applied, failed };
}
