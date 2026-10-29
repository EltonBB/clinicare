import type { BillingInterval, BillingMode, BusinessPlan, BusinessPlanStatus, SubscriptionStatus } from "@prisma/client";

import { USABLE_SUBSCRIPTION_STATUSES } from "@/lib/billing-access";

import type { PriceInfo } from "./paddle-config";

/** The fields of Paddle's subscription entity this app reads (Billing API, snake_case). */
export type PaddleSubscription = {
  id: string;
  status: string;
  customer_id: string;
  address_id?: string | null;
  business_id?: string | null;
  custom_data: Record<string, unknown> | null;
  current_billing_period: { starts_at: string; ends_at: string } | null;
  scheduled_change: { action: string; effective_at: string } | null;
  canceled_at: string | null;
  /** When Paddle last changed it; absent from older payloads. */
  updated_at?: string;
  items: Array<{ price: { id: string }; trial_dates: { starts_at: string; ends_at: string } | null }>;
};

export type SnapshotData = {
  billingMode: BillingMode;
  subscriptionStatus: SubscriptionStatus;
  planStatus: BusinessPlanStatus;
  plan: BusinessPlan;
  subscribedPlan: BusinessPlan;
  billingInterval: BillingInterval;
  paddleSubscriptionId: string;
  paddleCustomerId: string;
  currentPeriodEndsAt: Date | null;
  cancelAt: Date | null;
  trialEndsAt: Date | null;
  trialUsedAt: Date | null;
  lockedAt: Date | null;
  billingSyncedAt: Date;
};

export type SnapshotUpdate =
  | { kind: "update"; data: SnapshotData }
  | { kind: "unmatched"; reason: "unknown_price" | "unknown_status" };

const STATUS: Record<string, SubscriptionStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  paused: "PAUSED",
  canceled: "CANCELED",
};

// The older planStatus field the rest of the app shows; kept in step.
const PLAN_STATUS: Record<SubscriptionStatus, BusinessPlanStatus> = {
  NONE: "INACTIVE",
  TRIALING: "TRIALING",
  ACTIVE: "ACTIVE",
  PAST_DUE: "ACTIVE",
  PAUSED: "INACTIVE",
  CANCELED: "CANCELED",
};

function date(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * What a Paddle subscription snapshot means for the clinic it belongs to. Pure:
 * the caller finds the clinic, guards event order, and writes `data`.
 *
 * - The plan and interval come from the price (only this app's eight prices),
 *   except that an owner-offered Pro trial still running keeps the clinic on
 *   Pro while Paddle bills Basic (`subscribedPlan` is what Paddle bills).
 *   "Still running" is judged at `now`, not when the event happened: a late
 *   event must not hand back Pro after the trial ended.
 * - `trialUsedAt` is set once, the first time a trial is seen: one per clinic.
 * - `lockedAt` starts the 90-day retention clock when the subscription stops
 *   being usable, keeps an earlier start, and clears once it is usable again.
 * - Whether a clinic is free is never changed here, only on the owner page:
 *   the clinic id reaches Paddle from the browser, so a subscription someone
 *   else paid for (and then cancelled) must not be able to turn a free
 *   clinic into a lockable one.
 */
export function subscriptionSnapshotUpdate(
  subscription: PaddleSubscription,
  occurredAt: Date,
  prices: Map<string, PriceInfo>,
  existing: { billingMode: BillingMode; trialUsedAt: Date | null; lockedAt: Date | null; proTrialEndsAt?: Date | null },
  now: Date = new Date()
): SnapshotUpdate {
  const status = STATUS[subscription.status];
  if (!status) return { kind: "unmatched", reason: "unknown_status" };

  const item = subscription.items.find((candidate) => prices.has(candidate.price.id));
  const price = item ? prices.get(item.price.id) : undefined;
  if (!item || !price) return { kind: "unmatched", reason: "unknown_price" };

  const usable = (USABLE_SUBSCRIPTION_STATUSES as readonly SubscriptionStatus[]).includes(status);
  const trialStart = date(item.trial_dates?.starts_at);
  const firstTrialSeen = status === "TRIALING" || trialStart ? (trialStart ?? occurredAt) : null;
  const billingMode = existing.billingMode;

  return {
    kind: "update",
    data: {
      billingMode,
      subscriptionStatus: status,
      planStatus: PLAN_STATUS[status],
      plan: usable && existing.proTrialEndsAt && existing.proTrialEndsAt > now ? "PRO" : price.plan,
      subscribedPlan: price.plan,
      billingInterval: price.interval,
      paddleSubscriptionId: subscription.id,
      paddleCustomerId: subscription.customer_id,
      currentPeriodEndsAt: date(subscription.current_billing_period?.ends_at),
      cancelAt: subscription.scheduled_change?.action === "cancel" ? date(subscription.scheduled_change.effective_at) : null,
      trialEndsAt: date(item.trial_dates?.ends_at),
      trialUsedAt: existing.trialUsedAt ?? firstTrialSeen,
      lockedAt:
        usable || billingMode === "COMPLIMENTARY"
          ? null
          : (existing.lockedAt ?? date(subscription.canceled_at) ?? occurredAt),
      billingSyncedAt: occurredAt,
    },
  };
}

/**
 * When Paddle last changed this subscription, by Paddle's own clock: the time to
 * date a snapshot read from its API (a webhook carries its own). Dating it by
 * when the read finished would let it outrank a change made meanwhile.
 */
export function subscriptionChangedAt(subscription: PaddleSubscription, fallback: Date): Date {
  const changedAt = subscription.updated_at ? new Date(subscription.updated_at) : null;
  return changedAt && !Number.isNaN(changedAt.getTime()) ? changedAt : fallback;
}
