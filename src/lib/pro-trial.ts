import type { Business } from "@prisma/client";

/**
 * The free Pro trial for a clinic that pays for Basic (owner decision,
 * 2026-11-09): offered on its own once the clinic has paid for Basic for
 * PRO_TRIAL_AFTER_DAYS, started by the clinic (Settings › Billing or the
 * Reports lock), Pro for PRO_TRIAL_DAYS while it keeps paying the Basic price.
 * When it ends a popup asks: upgrade to Pro, or stay on Basic. Doing nothing
 * stays on Basic; Vela never moves a clinic onto a higher price it didn't
 * choose. Offered once, started once.
 */
export const PRO_TRIAL_DAYS = 14;
export const PRO_TRIAL_AFTER_DAYS = 30;
/** How long after a trial ran out its end popup still asks. */
export const PRO_TRIAL_ENDED_ASK_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the offer opens: PRO_TRIAL_AFTER_DAYS after the clinic was first seen paying for Basic. */
export function proTrialOfferOpensAt(firstPaidAt: Date): Date {
  return new Date(firstPaidAt.getTime() + PRO_TRIAL_AFTER_DAYS * DAY_MS);
}

export type ProTrialSource = Pick<
  Business,
  | "plan"
  | "subscribedPlan"
  | "billingMode"
  | "subscriptionStatus"
  | "cancelAt"
  | "proTrialOfferedAt"
  | "proTrialStartedAt"
  | "proTrialEndsAt"
>;

export type ProTrialState = { kind: "none" } | { kind: "offered" } | { kind: "active"; endsAt: Date };

function paysForBasic(business: ProTrialSource, now: Date): boolean {
  return (
    business.billingMode === "SUBSCRIPTION" &&
    business.subscriptionStatus === "ACTIVE" &&
    (business.subscribedPlan ?? business.plan) === "BASIC" &&
    !(business.cancelAt && business.cancelAt > now)
  );
}

/**
 * `proTrialOfferedAt` is when the offer opens, so it may still lie ahead: the
 * hourly billing cron sets and resets it (pro-trial-data.ts `scheduleProTrialOffers`).
 */
export function proTrialState(business: ProTrialSource, now: Date = new Date()): ProTrialState {
  if (business.proTrialStartedAt && business.proTrialEndsAt && business.proTrialEndsAt > now) {
    return { kind: "active", endsAt: business.proTrialEndsAt };
  }
  if (business.proTrialStartedAt || !paysForBasic(business, now)) return { kind: "none" };
  return business.proTrialOfferedAt && business.proTrialOfferedAt <= now ? { kind: "offered" } : { kind: "none" };
}

/**
 * When a trial ran its full length out in the last PRO_TRIAL_ENDED_ASK_DAYS and
 * the clinic is still on Basic: the end popup asks "upgrade or stay?". A trial
 * ended early (Back to Basic, or paid for Pro) is shorter and never asks.
 */
export function proTrialEndedAt(business: ProTrialSource, now: Date = new Date()): Date | null {
  const { proTrialStartedAt: startedAt, proTrialEndsAt: endsAt } = business;
  if (!startedAt || !endsAt || endsAt > now) return null;
  if (endsAt.getTime() - startedAt.getTime() < PRO_TRIAL_DAYS * DAY_MS) return null;
  if (now.getTime() - endsAt.getTime() > PRO_TRIAL_ENDED_ASK_DAYS * DAY_MS) return null;
  return paysForBasic(business, now) ? endsAt : null;
}
