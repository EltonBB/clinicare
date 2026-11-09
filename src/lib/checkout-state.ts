import type { Business } from "@prisma/client";

import { normalizeBusinessPlan } from "@/lib/billing";
import { workspaceAccess } from "@/lib/billing-access";
import type { PaidInterval, PaidPlan, PriceTable } from "@/lib/paddle/paddle-config";
import type { Locale } from "@/i18n/config";
import { formatZonedFullDate } from "@/lib/time-zone";

/** Days of Basic's free trial (scripts/paddle-setup.mjs creates the prices with it). */
export const TRIAL_DAYS = 14;

export type CheckoutStage =
  | { kind: "sign_up" }
  | { kind: "onboarding" }
  | { kind: "free_account" }
  | { kind: "subscribed"; plan: PaidPlan }
  | { kind: "subscribe"; trialAvailable: boolean };

type CheckoutBusiness = Pick<
  Business,
  "plan" | "billingMode" | "subscriptionStatus" | "cancelAt" | "trialEndsAt" | "lockedAt" | "trialUsedAt"
>;

/**
 * Where this visitor stands on the way to a paid plan. A new clinic may start
 * Basic with one free trial (`trialAvailable`); Pro is paid from day one, and a
 * clinic that has had its trial (or whose plan ended) pays from day one too. A
 * clinic that is already paying manages its plan in Settings instead of buying again.
 */
export function checkoutStage(args: { signedIn: boolean; business: CheckoutBusiness | null }): CheckoutStage {
  if (!args.signedIn) return { kind: "sign_up" };
  const business = args.business;
  if (!business) return { kind: "onboarding" };
  if (business.billingMode === "COMPLIMENTARY") return { kind: "free_account" };

  const access = workspaceAccess(business);
  if (access.kind === "full") return { kind: "subscribed", plan: normalizeBusinessPlan(business.plan) };
  return { kind: "subscribe", trialAvailable: access.kind === "needs_plan" && !business.trialUsedAt };
}

/** Only Basic starts with the free trial (owner decision, 2026-11-09); Pro is paid from day one. */
export function startsWithTrial(plan: PaidPlan, trialAvailable: boolean): boolean {
  return trialAvailable && plan === "BASIC";
}

export function checkoutPriceId(prices: PriceTable, plan: PaidPlan, interval: PaidInterval, trialAvailable: boolean): string {
  const pair = prices[plan][interval];
  return startsWithTrial(plan, trialAvailable) ? pair.trial : pair.noTrial;
}

/** The day a trial started now ends, for the checkout's order ("From November 10, 2026"). */
export function trialEndLabel(now = new Date(), timeZone?: string, locale: Locale = "en"): string {
  return formatZonedFullDate(new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000), timeZone, locale);
}
