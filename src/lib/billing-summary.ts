import type { Business, BillingInterval } from "@prisma/client";

import { isProBusinessPlan, normalizeBusinessPlan, planDisplayName } from "@/lib/billing";
import { workspaceAccess } from "@/lib/billing-access";
import { proTrialState } from "@/lib/pro-trial";
import { proAddedFeatures } from "@/lib/public-plans";
import { formatZonedFullDate } from "@/lib/time-zone";

export type BillingSummarySource = Pick<
  Business,
  | "plan"
  | "billingMode"
  | "subscriptionStatus"
  | "billingInterval"
  | "currentPeriodEndsAt"
  | "cancelAt"
  | "trialEndsAt"
  | "lockedAt"
  | "paddleCustomerId"
  | "subscribedPlan"
  | "proTrialOfferedAt"
  | "proTrialStartedAt"
  | "proTrialEndsAt"
>;

export type BillingChangeOption = {
  plan: "BASIC" | "PRO";
  interval: BillingInterval;
  label: string;
  /** What switching costs, in a sentence the confirm step shows. */
  effect: string;
};

export type BillingSummary = {
  // Server-computed (isProBusinessPlan) — gates the Pro-only rebooking row.
  isPro: boolean;
  planName: string;
  kind: "free" | "needs_plan" | "locked" | "subscribed";
  statusLabel: string;
  note: string;
  /** Paddle's portal (card, invoices, cancel) is available. */
  canManage: boolean;
  changeOptions: BillingChangeOption[];
  lockedFeatures: string[];
  /** The owner-offered free Pro trial: waiting to be started, or running until a date. */
  proTrial: { state: "offered" } | { state: "active"; endsOn: string } | null;
};

const PLAN_NAME = { BASIC: "Basic", PRO: "Pro" } as const;
const BILLED = { MONTH: "monthly", YEAR: "yearly" } as const;

/** Settings › Billing: where the clinic stands, and what it can do about it. */
export function buildBillingSummary(
  business: BillingSummarySource,
  options: { billingEnabled: boolean; now?: Date; timeZone?: string }
): BillingSummary {
  const now = options.now ?? new Date();
  const date = (value: Date) => formatZonedFullDate(value, options.timeZone);
  const trial = proTrialState(business, now);
  const base = {
    isPro: isProBusinessPlan(business.plan),
    planName: planDisplayName(business.plan),
    lockedFeatures: proAddedFeatures,
    proTrial:
      trial.kind === "offered"
        ? ({ state: "offered" } as const)
        : trial.kind === "active"
          ? ({ state: "active", endsOn: date(trial.endsAt) } as const)
          : null,
  };
  const access = workspaceAccess(business, now);
  const portal = options.billingEnabled && !!business.paddleCustomerId;

  if (business.billingMode === "COMPLIMENTARY") {
    return { ...base, kind: "free", statusLabel: "Free account", note: "Your clinic uses Vela free of charge.", canManage: false, changeOptions: [] };
  }
  if (access.kind === "needs_plan") {
    return {
      ...base,
      kind: "needs_plan",
      statusLabel: "No plan yet",
      note: "Choose a plan to start using Vela. Every plan starts with a 14-day free trial.",
      canManage: false,
      changeOptions: [],
    };
  }
  if (access.kind === "locked") {
    const kept = access.keptUntil ? ` Your records are kept until ${date(access.keptUntil)}.` : "";
    return {
      ...base,
      kind: "locked",
      statusLabel: "Ended",
      note: `Your plan has ended, so the workspace is read-only.${kept}`,
      canManage: portal,
      changeOptions: [],
    };
  }

  const interval = business.billingInterval ?? "MONTH";
  const trialing = business.subscriptionStatus === "TRIALING";
  const ending = business.cancelAt && business.cancelAt > now ? business.cancelAt : null;

  let statusLabel = "Active";
  let note = business.currentPeriodEndsAt
    ? `Renews on ${date(business.currentPeriodEndsAt)}, billed ${BILLED[interval]}.`
    : `Billed ${BILLED[interval]}.`;
  if (ending) {
    statusLabel = "Ending";
    note = `Your plan ends on ${date(ending)}. Resume it from Manage billing to keep using Vela.`;
  } else if (business.subscriptionStatus === "PAST_DUE") {
    statusLabel = "Payment failed";
    note = "Your last payment didn't go through. Update your card to keep using Vela.";
  } else if (trialing) {
    statusLabel = "Free trial";
    note = business.trialEndsAt
      ? `Free until ${date(business.trialEndsAt)}, then billed ${BILLED[interval]}.`
      : `Free trial, then billed ${BILLED[interval]}.`;
  }

  // What Paddle bills, not what the clinic currently gets: during an offered
  // Pro trial the subscription is still Basic.
  const currentPlan = normalizeBusinessPlan(business.subscribedPlan ?? business.plan);
  // Paddle won't change a subscription while a payment is failing: the card comes first.
  const changeOptions: BillingChangeOption[] =
    portal && !ending && business.subscriptionStatus !== "PAST_DUE"
      ? (["BASIC", "PRO"] as const)
          .flatMap((plan) => (["MONTH", "YEAR"] as const).map((next) => ({ plan, interval: next })))
          .filter((option) => option.plan !== currentPlan || option.interval !== interval)
          .map((option) => ({
            ...option,
            label: `${PLAN_NAME[option.plan]}, billed ${BILLED[option.interval]}`,
            effect: trialing
              ? "Nothing is charged before your trial ends."
              : option.interval !== interval
                ? "A new billing period starts today. You pay for it now, less the unused part of this one."
                : option.plan === "PRO"
                  ? "You're charged the difference for the rest of this period now."
                  : "The unused part of this period is credited to your next bill.",
          }))
      : [];

  return { ...base, kind: "subscribed", statusLabel, note, canManage: portal, changeOptions };
}
