import { USABLE_SUBSCRIPTION_STATUSES } from "@/lib/billing-access";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { hasValidFreeUpgradeStamp } from "./free-upgrade";
import { cancelPaddleSubscription, PaddleApiError } from "./paddle-api";
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
  proTrialEndsAt: true,
} as const;

// Paddle statuses that are, or can become, billable again.
const LIVE_PADDLE_STATUSES = new Set(["trialing", "active", "past_due", "paused"]);

type RefusalReason = "free_account" | "another_live_subscription" | "trial_already_used" | "pro_trial";

/**
 * A subscription the app won't attach to its clinic is cancelled in Paddle at
 * once, so nobody is charged for a plan that unlocks nothing: a second
 * checkout from another tab, a checkout for a clinic the owner has made free,
 * a second free trial, or a free trial on Pro, which is paid from day one (both
 * the trial price picked in the browser). Logged by id
 * only; a cancel that fails is an error a person follows up.
 */
async function refuseSubscription(
  config: PaddleConfig,
  subscription: PaddleSubscription,
  businessId: string,
  reason: RefusalReason
): Promise<"unmatched"> {
  logger.warn("Paddle subscription refused.", { businessId, subscriptionId: subscription.id, reason });
  if (LIVE_PADDLE_STATUSES.has(subscription.status)) {
    try {
      await cancelPaddleSubscription(config, subscription.id);
    } catch (error) {
      // A late event can still say "active" for a subscription Paddle has
      // since cancelled: that is the outcome we wanted, not a failure.
      if (error instanceof PaddleApiError && error.code === "subscription_update_when_canceled") {
        return "unmatched";
      }
      logger.error("Couldn't cancel a refused Paddle subscription.", error, {
        businessId,
        subscriptionId: subscription.id,
      });
    }
  }
  return "unmatched";
}

/**
 * Writes a Paddle subscription snapshot onto the clinic it belongs to: the one
 * already holding this subscription id, else the clinic named in the checkout's
 * `custom_data.businessId`. Events can arrive late, twice or out of order, so
 * the write only lands when the snapshot is not older than the last one
 * applied (`billingSyncedAt`), checked in the same statement.
 *
 * The clinic id reaches Paddle from the browser, so it is never trusted to
 * change more than a paying clinic's own billing: a free clinic is left as it
 * is, and a clinic is never taken over by a second live subscription, given a
 * second free trial, or started on Pro with a trial (see {@link refuseSubscription}).
 *
 * The write also only lands while the clinic is as it was read, so two
 * checkouts' webhooks racing can't both attach: the loser reads again once
 * (`retried`) and is refused then.
 */
export async function applySubscriptionSnapshot(
  config: PaddleConfig,
  subscription: PaddleSubscription,
  occurredAt: Date,
  retried = false
): Promise<SyncOutcome> {
  const prices = priceLookup(config.prices);
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
      return refuseSubscription(config, subscription, business.id, "another_live_subscription");
    }
    const hasTrial = subscription.status === "trialing" || subscription.items.some((item) => item.trial_dates);
    // Only Basic starts with a free trial (owner decision, 2026-11-09). A new
    // subscription trialing on Pro can only come from a tampered checkout; one
    // already attached (a clinic trialing before the rule) is left as it is.
    if (hasTrial && subscription.items.some((item) => prices.get(item.price.id)?.plan === "PRO")) {
      return refuseSubscription(config, subscription, business.id, "pro_trial");
    }
    // Its own earlier webhook may have attached it (and marked the trial used) since.
    if (hasTrial && business.trialUsedAt && business.paddleSubscriptionId !== subscription.id) {
      return refuseSubscription(config, subscription, business.id, "trial_already_used");
    }
  }

  // Free accounts are the owner's call (/owner), never Paddle's, with one
  // exception: the clinic's own owner chose to pay from checkout, proven by the
  // server-signed stamp only that page adds (free-upgrade.ts). Then it becomes
  // an ordinary paying clinic, on a plan paid from day one.
  let billingMode = business.billingMode;
  if (billingMode === "COMPLIMENTARY") {
    const paidFromDayOne = subscription.status !== "trialing" && !subscription.items.some((item) => item.trial_dates);
    // The stamp's age counts to when the checkout created the subscription, not
    // to now: a webhook processed late (an outage, retries, the reconcile cron)
    // must not cancel a payment made while the stamp was fresh.
    const created = subscription.created_at ? new Date(subscription.created_at) : null;
    const paidAt = created && !Number.isNaN(created.getTime()) ? created : occurredAt;
    const chosenByOwner = hasValidFreeUpgradeStamp(config.webhookSecret, business.id, subscription.custom_data, paidAt);
    if (business.paddleSubscriptionId === subscription.id || !paidFromDayOne || !chosenByOwner) {
      return refuseSubscription(config, subscription, business.id, "free_account");
    }
    billingMode = "SUBSCRIPTION";
  }

  const update = subscriptionSnapshotUpdate(subscription, occurredAt, prices, { ...business, billingMode });
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
      paddleSubscriptionId: business.paddleSubscriptionId,
      billingMode: business.billingMode,
      OR: [{ billingSyncedAt: null }, { billingSyncedAt: { lte: occurredAt } }],
    },
    data: update.data,
  });
  if (written.count > 0) {
    // A new checkout replaced a paused subscription, which could otherwise
    // resume and bill alongside it: it ends now.
    const replaced = business.paddleSubscriptionId;
    if (replaced && replaced !== subscription.id && business.subscriptionStatus === "PAUSED") {
      try {
        await cancelPaddleSubscription(config, replaced);
      } catch (error) {
        logger.error("Couldn't cancel a replaced paused Paddle subscription.", error, {
          businessId: business.id,
          subscriptionId: replaced,
        });
      }
    }
    return "applied";
  }
  // Older than what landed, or the clinic changed since the read: read again
  // once, which refuses this subscription if another one took the clinic.
  return retried ? "stale" : applySubscriptionSnapshot(config, subscription, occurredAt, true);
}
