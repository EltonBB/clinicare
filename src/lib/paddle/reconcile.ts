import { USABLE_SUBSCRIPTION_STATUSES } from "@/lib/billing-access";
import { getReconcileCursor, setReconcileCursor } from "@/lib/follow-up-cursor";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { getPaddleSubscription } from "./paddle-api";
import type { PaddleConfig } from "./paddle-config";
import { subscriptionChangedAt } from "./subscription-snapshot";
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
 * to run out, so they are re-read too: a missed `resumed` event would
 * otherwise keep the clinic read-only for good.
 *
 * One that stays due (unchanged in Paddle, or a failed read) isn't written,
 * so they take turns by id from where the last run stopped: none can hold the
 * batch and starve the rest.
 */
export async function reconcileOverdueSubscriptions(
  config: PaddleConfig,
  now: Date = new Date()
): Promise<{ checked: number; applied: number; failed: number }> {
  const overdueBefore = new Date(now.getTime() - GRACE_MS);
  const where = {
    // A free clinic's leftover subscription is never synced (subscription-sync.ts).
    billingMode: "SUBSCRIPTION" as const,
    paddleSubscriptionId: { not: null },
    OR: [
      {
        subscriptionStatus: { in: [...USABLE_SUBSCRIPTION_STATUSES] },
        OR: [{ currentPeriodEndsAt: { lt: overdueBefore } }, { cancelAt: { lt: now } }],
      },
      { subscriptionStatus: "PAUSED" as const },
    ],
  };
  const page = (id: { gt: string } | { lte: string } | undefined, take: number) =>
    prisma.business.findMany({
      where: { ...where, ...(id ? { id } : {}) },
      select: { id: true, paddleSubscriptionId: true },
      orderBy: { id: "asc" },
      take,
    });
  const after = await getReconcileCursor();
  const due = await page(after ? { gt: after } : undefined, RECONCILE_BATCH);
  // Reached the end with room left: round again from the start.
  if (after && due.length < RECONCILE_BATCH) due.push(...(await page({ lte: after }, RECONCILE_BATCH - due.length)));
  if (due.length > 0) await setReconcileCursor(due[due.length - 1].id);

  let applied = 0;
  let failed = 0;
  for (const business of due) {
    if (!business.paddleSubscriptionId) continue;
    try {
      const subscription = await getPaddleSubscription(config, business.paddleSubscriptionId);
      const observedAt = subscriptionChangedAt(subscription, now);
      if ((await applySubscriptionSnapshot(config, subscription, observedAt)) === "applied") applied += 1;
    } catch (error) {
      failed += 1;
      logger.error("Couldn't re-read a subscription from Paddle.", error, { businessId: business.id });
    }
  }
  return { checked: due.length, applied, failed };
}
