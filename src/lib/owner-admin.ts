import type { Business } from "@prisma/client";

import { planDisplayName } from "@/lib/billing";
import { retentionEndsAt, USABLE_SUBSCRIPTION_STATUSES, workspaceAccess } from "@/lib/billing-access";
import { formatZonedFullDate } from "@/lib/time-zone";

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
};

const STATUS_LABEL = {
  NONE: "No plan yet",
  TRIALING: "Trial",
  ACTIVE: "Paying",
  PAST_DUE: "Payment failing",
  PAUSED: "Paused",
  CANCELED: "Cancelled",
} as const;

export function ownerBillingRow(business: OwnerBillingSource, now: Date, timeZone?: string): OwnerBillingRow {
  const date = (value: Date) => formatZonedFullDate(value, timeZone);
  const isFree = business.billingMode === "COMPLIMENTARY";
  const billedByPaddle = (USABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(business.subscriptionStatus);
  const interval = business.billingInterval === "YEAR" ? "yearly" : business.billingInterval === "MONTH" ? "monthly" : "";

  const billing = isFree
    ? "Free account"
    : [STATUS_LABEL[business.subscriptionStatus], billedByPaddle ? interval : ""].filter(Boolean).join(" · ");

  let detail = "";
  if (!isFree) {
    if (business.cancelAt && business.cancelAt > now) detail = `Ends ${date(business.cancelAt)}`;
    else if (business.subscriptionStatus === "TRIALING" && business.trialEndsAt) detail = `Trial until ${date(business.trialEndsAt)}`;
    else if (billedByPaddle && business.currentPeriodEndsAt) detail = `Renews ${date(business.currentPeriodEndsAt)}`;
  }

  const access = workspaceAccess(business, now);
  // A clinic made paying that never subscribes is kept 90 days too: its clock
  // starts when the owner made it paying.
  const keptUntil = access.kind !== "full" && business.lockedAt ? retentionEndsAt(business.lockedAt) : null;
  const kept = keptUntil ? `, kept until ${date(keptUntil)}` : "";
  const accessLabel =
    access.kind === "full" ? "Usable" : access.kind === "needs_plan" ? `Choosing a plan${kept}` : `Read-only${kept}`;

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
  };
}
