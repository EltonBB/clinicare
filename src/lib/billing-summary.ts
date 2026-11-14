import type { Business, BillingInterval } from "@prisma/client";

import { isProBusinessPlan, normalizeBusinessPlan, planDisplayName } from "@/lib/billing";
import { workspaceAccess } from "@/lib/billing-access";
import { proTrialState } from "@/lib/pro-trial";
import { proAddedFeatures } from "@/lib/public-plans";
import { formatZonedFullDate } from "@/lib/time-zone";
import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { settings as enSettings } from "@/i18n/messages/en/settings";

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
  /** Basic → Pro: opens the upgrade checkout (Upgrade → checkout → Pay) instead of switching in place. */
  upgrade: boolean;
};

export type BillingSummary = {
  // Server-computed (isProBusinessPlan) — gates the Pro-only rebooking row.
  isPro: boolean;
  planName: string;
  /** What Pro adds over Basic: "Included in your plan" on Pro, "Unlock with Pro" otherwise. */
  proFeatures: string[];
  kind: "free" | "needs_plan" | "locked" | "subscribed";
  statusLabel: string;
  note: string;
  /** The clinic has a Paddle customer: invoices and billing details can be read. */
  canManage: boolean;
  /** Paddle.js settings (public) for the in-app card form; null while billing is off. */
  paddle: { env: "sandbox" | "production"; clientToken: string } | null;
  /** The plan Paddle bills and its period, while a subscription runs. */
  current: { plan: "BASIC" | "PRO"; interval: BillingInterval } | null;
  /** In-app actions on the running subscription. */
  canCancel: boolean;
  canResume: boolean;
  canUpdateCard: boolean;
  changeOptions: BillingChangeOption[];
  /** The free Pro trial: waiting to be started, or running until a date. */
  proTrial: { state: "offered" } | { state: "active"; endsOn: string } | null;
};

const PLAN_NAME = { BASIC: "Basic", PRO: "Pro" } as const;
const NO_SUBSCRIPTION = { current: null, canCancel: false, canResume: false, canUpdateCard: false };

/** The reader's words for this card: `settings.billing` plus what Pro adds, in their language. */
export type BillingSummaryCopy = { billing: typeof enSettings.billing; proFeatures: string[] };

/** Settings › Billing: where the clinic stands, and what it can do about it. */
export function buildBillingSummary(
  business: BillingSummarySource,
  options: {
    billingEnabled: boolean;
    paddle?: { env: "sandbox" | "production"; clientToken: string } | null;
    now?: Date;
    timeZone?: string;
    locale?: Locale;
    copy?: BillingSummaryCopy;
  }
): BillingSummary {
  const now = options.now ?? new Date();
  const t = options.copy?.billing ?? enSettings.billing;
  const date = (value: Date) => formatZonedFullDate(value, options.timeZone, options.locale);
  const billed = (interval: BillingInterval) => t.intervals[interval];
  const trial = proTrialState(business, now);
  const base = {
    isPro: isProBusinessPlan(business.plan),
    paddle: options.paddle ?? null,
    planName: planDisplayName(business.plan),
    proFeatures: options.copy?.proFeatures ?? proAddedFeatures,
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
    return { ...base, kind: "free", statusLabel: t.statuses.free, note: t.notes.free, canManage: false, changeOptions: [], ...NO_SUBSCRIPTION };
  }
  if (access.kind === "needs_plan") {
    return {
      ...base,
      kind: "needs_plan",
      statusLabel: t.statuses.noPlan,
      note: t.notes.noPlan,
      canManage: false,
      changeOptions: [],
      ...NO_SUBSCRIPTION,
    };
  }
  if (access.kind === "locked") {
    const kept = access.keptUntil ? ` ${fmt(t.notes.keptUntil, { date: date(access.keptUntil) })}` : "";
    return {
      ...base,
      kind: "locked",
      statusLabel: t.statuses.ended,
      note: `${t.notes.ended}${kept}`,
      canManage: portal,
      changeOptions: [],
      ...NO_SUBSCRIPTION,
    };
  }

  const interval = business.billingInterval ?? "MONTH";
  const trialing = business.subscriptionStatus === "TRIALING";
  const ending = business.cancelAt && business.cancelAt > now ? business.cancelAt : null;

  let statusLabel = t.statuses.active;
  let note = business.currentPeriodEndsAt
    ? fmt(t.notes.renews, { date: date(business.currentPeriodEndsAt), interval: billed(interval) })
    : fmt(t.notes.billed, { interval: billed(interval) });
  if (ending) {
    statusLabel = t.statuses.ending;
    note = fmt(t.notes.ends, { date: date(ending) });
  } else if (business.subscriptionStatus === "PAST_DUE") {
    statusLabel = t.statuses.pastDue;
    note = t.notes.pastDue;
  } else if (trialing) {
    statusLabel = t.statuses.trial;
    note = business.trialEndsAt
      ? fmt(t.notes.trialUntil, { date: date(business.trialEndsAt), interval: billed(interval) })
      : fmt(t.notes.trial, { interval: billed(interval) });
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
          .map((option) => {
            const upgrade = option.plan === "PRO" && currentPlan === "BASIC";
            return {
              ...option,
              label: fmt(t.changeLabel, { plan: PLAN_NAME[option.plan], interval: billed(option.interval) }),
              upgrade,
              effect: upgrade
                ? trialing
                  ? t.effects.upgradeFromTrial
                  : t.effects.upgrade
                : trialing
                  ? t.effects.trial
                  : option.interval !== interval
                    ? t.effects.newPeriod
                    : option.plan === "PRO"
                      ? t.effects.payDifference
                      : t.effects.credited,
            };
          })
      : [];

  return {
    ...base,
    kind: "subscribed",
    statusLabel,
    note,
    canManage: portal,
    changeOptions,
    current: { plan: currentPlan, interval },
    canCancel: portal && !ending,
    canResume: portal && Boolean(ending),
    canUpdateCard: portal,
  };
}
