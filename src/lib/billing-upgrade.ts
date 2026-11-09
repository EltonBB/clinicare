import type { Business } from "@prisma/client";

import type { Locale } from "@/i18n/config";
import { USABLE_SUBSCRIPTION_STATUSES } from "@/lib/billing-access";
import { formatMinorAmount } from "@/lib/billing-history";
import { logger } from "@/lib/logger";
import { previewPaddleSubscriptionChange } from "@/lib/paddle/paddle-api";
import type { PaddleConfig, PaidInterval } from "@/lib/paddle/paddle-config";
import { formatZonedFullDate } from "@/lib/time-zone";

/**
 * What "Upgrade to Pro" does for this clinic (owner decision, 2026-11-09: one
 * path, Upgrade → checkout → Pay). The checkout page shows it and the upgrade
 * action re-checks it, so the two can't disagree.
 *
 * - `change`: pays for Basic. The subscription moves to Pro now and Paddle
 *   charges the prorated difference to the card on file. An owner-offered Pro
 *   trial that is running ends with it (the clinic chose to pay).
 * - `end_trial`: on Basic's free trial. Pro is paid from day one, so the trial
 *   ends and Pro is charged now.
 * - `already_pro`: Paddle already bills Pro.
 * - `resume_first` / `card_first`: a cancellation is scheduled, or the last
 *   payment failed; that is sorted in Settings › Billing first.
 * - `subscribe`: no running subscription (a new or a locked clinic): the normal
 *   checkout, where Pro is paid from day one.
 * - `free`: a clinic the owner made free.
 */
export type UpgradePath =
  | { kind: "change" }
  | { kind: "end_trial" }
  | { kind: "already_pro" }
  | { kind: "resume_first" }
  | { kind: "card_first" }
  | { kind: "subscribe" }
  | { kind: "free" };

export type UpgradeSource = Pick<
  Business,
  "billingMode" | "subscriptionStatus" | "plan" | "subscribedPlan" | "cancelAt" | "paddleSubscriptionId"
>;

export function upgradePath(business: UpgradeSource, now: Date = new Date()): UpgradePath {
  if (business.billingMode === "COMPLIMENTARY") return { kind: "free" };
  const usable = (USABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(business.subscriptionStatus);
  if (!usable || !business.paddleSubscriptionId) return { kind: "subscribe" };
  // What Paddle bills; `plan` is Pro during an owner-offered Pro trial on Basic.
  if ((business.subscribedPlan ?? business.plan) !== "BASIC") return { kind: "already_pro" };
  if (business.cancelAt && business.cancelAt > now) return { kind: "resume_first" };
  if (business.subscriptionStatus === "PAST_DUE") return { kind: "card_first" };
  if (business.subscriptionStatus === "TRIALING") return { kind: "end_trial" };
  return { kind: "change" };
}

/** What the upgrade charges, as the checkout prints it. */
export type UpgradeQuote = {
  /** Charged to the card on file when the clinic pays. */
  dueToday: string;
  /** Account credit covers it all (e.g. after a recent downgrade): nothing is charged. */
  nothingDue: boolean;
  /** Pro's price per period from then on. */
  recurring: string;
  /** When the next Pro charge falls. */
  nextOn: string;
};

/**
 * Asks Paddle what the upgrade costs (its own proration, tax and currency;
 * never worked out here). Ending a trial charges Pro's full price today and
 * starts the period now, so the trial's quote is the recurring price, next due
 * one period on. Null when Paddle can't answer: the checkout then doesn't offer
 * to pay, since a clinic is never charged an amount it hasn't seen.
 */
export async function upgradeQuote(
  config: PaddleConfig,
  subscriptionId: string,
  path: Extract<UpgradePath, { kind: "change" | "end_trial" }>,
  interval: PaidInterval,
  locale: Locale,
  timeZone?: string,
  now: Date = new Date()
): Promise<UpgradeQuote | null> {
  const trialing = path.kind === "end_trial";
  try {
    const preview = await previewPaddleSubscriptionChange(config, subscriptionId, config.prices.PRO[interval].noTrial, {
      trialing,
    });
    // The price itself: the recurring grand total has any account credit taken off.
    const recurringMinor = Number(preview.recurring_transaction_details?.totals.total);
    if (!Number.isFinite(recurringMinor)) return null;
    const money = (minor: number) => formatMinorAmount(minor, preview.currency_code, locale);
    if (trialing) {
      const next = new Date(now);
      if (interval === "YEAR") next.setUTCFullYear(next.getUTCFullYear() + 1);
      else next.setUTCMonth(next.getUTCMonth() + 1);
      return {
        dueToday: money(recurringMinor),
        nothingDue: false,
        recurring: money(recurringMinor),
        nextOn: formatZonedFullDate(next, timeZone, locale),
      };
    }
    const dueMinor = Number(preview.immediate_transaction?.details.totals.grand_total ?? 0);
    if (!Number.isFinite(dueMinor) || !preview.next_billed_at) return null;
    return {
      dueToday: money(dueMinor),
      nothingDue: dueMinor === 0,
      recurring: money(recurringMinor),
      nextOn: formatZonedFullDate(new Date(preview.next_billed_at), timeZone, locale),
    };
  } catch (error) {
    logger.warn("Couldn't preview the Pro upgrade.", { subscriptionId, error: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}
