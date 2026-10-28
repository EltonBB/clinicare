import { USABLE_SUBSCRIPTION_STATUSES } from "@/lib/billing-access";
import { getPausedReconcileCursor, setPausedReconcileCursor } from "@/lib/follow-up-cursor";
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
 * An unchanged paused one isn't written, so they take turns by id from where
 * the last run stopped instead of by when they last changed.
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
  const paused: typeof overdue = [];
  if (overdue.length < RECONCILE_BATCH) {
    const after = await getPausedReconcileCursor();
    const pausedPage = (id: { gt: string } | { lte: string } | undefined, take: number) =>
      prisma.business.findMany({
        where: { ...synced, subscriptionStatus: "PAUSED", ...(id ? { id } : {}) },
        select,
        orderBy: { id: "asc" },
        take,
      });
    const room = RECONCILE_BATCH - overdue.length;
    paused.push(...(await pausedPage(after ? { gt: after } : undefined, room)));
    // Reached the end with room left: round again from the start.
    if (after && paused.length < room) paused.push(...(await pausedPage({ lte: after }, room - paused.length)));
    if (paused.length > 0) await setPausedReconcileCursor(paused[paused.length - 1].id);
  }
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
