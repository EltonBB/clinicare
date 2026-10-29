import type { Business } from "@prisma/client";

/**
 * The owner-offered free Pro trial for a clinic that pays for Basic. The owner
 * offers it from /owner; the clinic starts it from Settings › Billing and gets
 * Pro for PRO_TRIAL_DAYS while its Basic billing runs unchanged. Before the
 * end it keeps Pro (its subscription moves to the Pro price) or goes back to
 * Basic; doing nothing goes back to Basic. Vela never moves a clinic onto a
 * higher price it didn't choose. Offered once, started once.
 */
export const PRO_TRIAL_DAYS = 14;

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

export type ProTrialState =
  | { kind: "none" }
  | { kind: "offerable" }
  | { kind: "offered" }
  | { kind: "active"; endsAt: Date };

export function proTrialState(business: ProTrialSource, now: Date = new Date()): ProTrialState {
  if (business.proTrialStartedAt && business.proTrialEndsAt && business.proTrialEndsAt > now) {
    return { kind: "active", endsAt: business.proTrialEndsAt };
  }
  const payingForBasic =
    business.billingMode === "SUBSCRIPTION" &&
    business.subscriptionStatus === "ACTIVE" &&
    (business.subscribedPlan ?? business.plan) === "BASIC" &&
    !(business.cancelAt && business.cancelAt > now);
  if (!payingForBasic || business.proTrialStartedAt) return { kind: "none" };
  return business.proTrialOfferedAt ? { kind: "offered" } : { kind: "offerable" };
}
