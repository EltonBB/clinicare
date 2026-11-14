import type { Business } from "@prisma/client";

import { planDisplayName } from "@/lib/billing";
import { retentionEndsAt, USABLE_SUBSCRIPTION_STATUSES, workspaceAccess } from "@/lib/billing-access";
import { proTrialState } from "@/lib/pro-trial";
import { formatZonedFullDate } from "@/lib/time-zone";
import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { messages } from "@/i18n/messages";

/**
 * Whether this signed-in user may open the owner page (/owner): their email is
 * on the comma-separated VELA_ADMIN_EMAILS and confirmed (an unconfirmed
 * sign-up could otherwise claim the owner's address). An empty or missing
 * list admits nobody, so the page stays closed until it is configured on purpose.
 */
export function isOwnerAdmin(
  user: { email?: string; email_confirmed_at?: string | null } | null,
  allowList = process.env.VELA_ADMIN_EMAILS
): boolean {
  if (!user?.email || !user.email_confirmed_at || !allowList) return false;
  const wanted = user.email.trim().toLowerCase();
  return allowList
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry.length > 0 && entry === wanted);
}

export type OwnerBillingSource = Pick<
  Business,
  | "id"
  | "name"
  | "createdAt"
  | "plan"
  | "billingMode"
  | "subscriptionStatus"
  | "billingInterval"
  | "currentPeriodEndsAt"
  | "cancelAt"
  | "trialEndsAt"
  | "lockedAt"
  | "subscribedPlan"
  | "proTrialOfferedAt"
  | "proTrialStartedAt"
  | "proTrialEndsAt"
  | "proTrialAnsweredAt"
>;

export type OwnerBillingRow = {
  id: string;
  name: string;
  createdOn: string;
  plan: string;
  billing: string;
  detail: string;
  access: string;
  dueForDeletion: boolean;
  isFree: boolean;
  /** A clinic Paddle is billing can't be made free here: cancel it there first. */
  canMakeFree: boolean;
  /** The free Pro trial: offered, running, or over while still on Basic (and whether the clinic chose to stay). */
  proTrial: "offered" | "active" | "ended" | "stayed" | null;
};

export function ownerBillingRow(
  business: OwnerBillingSource,
  now: Date,
  timeZone?: string,
  locale: Locale = "en"
): OwnerBillingRow {
  const t = messages[locale].owner;
  const date = (value: Date) => formatZonedFullDate(value, timeZone, locale);
  const isFree = business.billingMode === "COMPLIMENTARY";
  const billedByPaddle = (USABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(business.subscriptionStatus);
  const interval = business.billingInterval ? t.intervals[business.billingInterval] : "";

  const billing = isFree
    ? t.free
    : [t.statuses[business.subscriptionStatus], billedByPaddle ? interval : ""].filter(Boolean).join(" · ");

  let detail = "";
  if (!isFree) {
    if (business.cancelAt && business.cancelAt > now) detail = fmt(t.ends, { date: date(business.cancelAt) });
    else if (business.subscriptionStatus === "TRIALING" && business.trialEndsAt)
      detail = fmt(t.trialUntil, { date: date(business.trialEndsAt) });
    else if (billedByPaddle && business.currentPeriodEndsAt) detail = fmt(t.renews, { date: date(business.currentPeriodEndsAt) });
  }

  const access = workspaceAccess(business, now);
  // A clinic made paying that never subscribes is kept 90 days too: its clock
  // starts when the owner made it paying.
  const keptUntil = access.kind !== "full" && business.lockedAt ? retentionEndsAt(business.lockedAt) : null;
  const kept = keptUntil ? fmt(t.keptUntil, { date: date(keptUntil) }) : "";
  const accessLabel =
    access.kind === "full"
      ? t.access.full
      : fmt(access.kind === "needs_plan" ? t.access.choosing : t.access.readOnly, { kept });

  const trialKind = proTrialState(business, now).kind;
  // After a trial, a clinic that paid for Pro shows as Pro; one still on Basic shows
  // "stayed" only when it chose to (an Upgrade it didn't pay for leaves it "ended").
  const afterTrial =
    trialKind === "none" && business.proTrialStartedAt && (business.subscribedPlan ?? business.plan) === "BASIC"
      ? business.proTrialAnsweredAt
        ? ("stayed" as const)
        : ("ended" as const)
      : null;
  const proTrial = trialKind === "none" ? afterTrial : trialKind;

  return {
    id: business.id,
    name: business.name,
    createdOn: date(business.createdAt),
    plan: planDisplayName(business.plan),
    billing,
    detail,
    access: accessLabel,
    dueForDeletion: !!keptUntil && keptUntil <= now,
    isFree,
    canMakeFree: !billedByPaddle,
    proTrial,
  };
}
