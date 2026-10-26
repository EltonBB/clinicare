import { USABLE_SUBSCRIPTION_STATUSES } from "@/lib/billing-access";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { priceLookup, type PaddleConfig } from "./paddle-config";
import { type PaddleSubscription, subscriptionSnapshotUpdate } from "./subscription-snapshot";

export type SyncOutcome = "applied" | "stale" | "unmatched";

const BUSINESS_SELECT = {
  id: true,
  billingMode: true,
  subscriptionStatus: true,
  paddleSubscriptionId: true,
  trialUsedAt: true,
  lockedAt: true,
} as const;

/**
 * Writes a Paddle subscription snapshot onto the clinic it belongs to: the one
 * already holding this subscription id, else the clinic named in the checkout's
 * `custom_data.businessId`. Events can arrive late, twice or out of order, so
 * the write only lands when the snapshot is not older than the last one
 * applied (`billingSyncedAt`), checked in the same statement.
 *
 * A clinic that already has a different live subscription is never taken over
 * by another one (logged, by id only, for a person to sort out).
 */
export async function applySubscriptionSnapshot(
  config: PaddleConfig,
  subscription: PaddleSubscription,
  occurredAt: Date
): Promise<SyncOutcome> {
  let business = await prisma.business.findUnique({
    where: { paddleSubscriptionId: subscription.id },
    select: BUSINESS_SELECT,
  });

  if (!business) {
    const businessId = subscription.custom_data?.businessId;
    if (typeof businessId !== "string" || !businessId) {
      logger.warn("Paddle subscription names no clinic.", { subscriptionId: subscription.id });
      return "unmatched";
    }
    business = await prisma.business.findUnique({ where: { id: businessId }, select: BUSINESS_SELECT });
    if (!business) {
      logger.warn("Paddle subscription names a clinic that doesn't exist.", { subscriptionId: subscription.id });
      return "unmatched";
    }
    const holdsAnotherLiveSubscription =
      business.paddleSubscriptionId !== null &&
      business.paddleSubscriptionId !== subscription.id &&
      (USABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(business.subscriptionStatus);
    if (holdsAnotherLiveSubscription) {
      logger.warn("Paddle subscription ignored: the clinic already has another live subscription.", {
        businessId: business.id,
        subscriptionId: subscription.id,
      });
      return "unmatched";
    }
  }

  const update = subscriptionSnapshotUpdate(subscription, occurredAt, priceLookup(config.prices), business);
  if (update.kind === "unmatched") {
    logger.warn("Paddle subscription not applied.", {
      businessId: business.id,
      subscriptionId: subscription.id,
      reason: update.reason,
    });
    return "unmatched";
  }

  const written = await prisma.business.updateMany({
    where: {
      id: business.id,
      OR: [{ billingSyncedAt: null }, { billingSyncedAt: { lte: occurredAt } }],
    },
    data: update.data,
  });
  return written.count > 0 ? "applied" : "stale";
}
