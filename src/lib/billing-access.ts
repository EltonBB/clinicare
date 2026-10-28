import type { Business, Prisma, SubscriptionStatus } from "@prisma/client";

/**
 * What a workspace may do, from its billing state. One rule for every surface:
 * the workspace layout, server actions, the mobile API, the messaging seam and
 * the cron senders all ask this (or {@link workspaceUsableWhere}, its query twin).
 *
 * - `full`: everything works. A notice may ride along (trial ending, a failed
 *   payment Paddle is retrying, a scheduled cancellation).
 * - `needs_plan`: a paying-mode workspace that never subscribed. It is sent to
 *   choose a plan before it can use anything.
 * - `locked`: the subscription ended. Read-only: the clinic sees its records but
 *   can't change anything, and nothing is sent to its patients. Kept until
 *   `keptUntil`, then the owner may delete it.
 */
export type WorkspaceAccess =
  | { kind: "full"; notice: BillingNotice | null }
  | { kind: "needs_plan" }
  | { kind: "locked"; keptUntil: Date | null };

export type BillingNotice =
  | { kind: "past_due" }
  | { kind: "ending"; endsAt: Date }
  | { kind: "trial"; endsAt: Date };

export type BillingSnapshot = Pick<
  Business,
  "billingMode" | "subscriptionStatus" | "cancelAt" | "trialEndsAt" | "lockedAt"
>;

/** Days a locked workspace's data is kept before the owner may delete it. */
export const RETENTION_DAYS = 90;

/** Statuses Paddle still bills (or is retrying): the workspace stays usable. */
export const USABLE_SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE"] as const satisfies readonly SubscriptionStatus[];

export const WORKSPACE_LOCKED_ERROR =
  "This workspace is read-only because its plan has ended. Renew it in Settings › Billing to keep working.";

export function retentionEndsAt(lockedAt: Date): Date {
  return new Date(lockedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function isUsableStatus(status: SubscriptionStatus): boolean {
  return (USABLE_SUBSCRIPTION_STATUSES as readonly SubscriptionStatus[]).includes(status);
}

export function workspaceAccess(business: BillingSnapshot, now: Date = new Date()): WorkspaceAccess {
  if (business.billingMode === "COMPLIMENTARY") return { kind: "full", notice: null };

  const status = business.subscriptionStatus;
  if (status === "NONE") return { kind: "needs_plan" };

  if (!isUsableStatus(status)) {
    return { kind: "locked", keptUntil: business.lockedAt ? retentionEndsAt(business.lockedAt) : null };
  }

  if (status === "PAST_DUE") return { kind: "full", notice: { kind: "past_due" } };
  if (business.cancelAt && business.cancelAt > now) {
    return { kind: "full", notice: { kind: "ending", endsAt: business.cancelAt } };
  }
  if (status === "TRIALING" && business.trialEndsAt) {
    return { kind: "full", notice: { kind: "trial", endsAt: business.trialEndsAt } };
  }
  return { kind: "full", notice: null };
}

export function canUseWorkspace(business: BillingSnapshot, now: Date = new Date()): boolean {
  return workspaceAccess(business, now).kind === "full";
}

/** The {@link canUseWorkspace} rule as a Prisma filter, for jobs that pick workspaces. */
export function workspaceUsableWhere(): Prisma.BusinessWhereInput {
  return {
    OR: [
      { billingMode: "COMPLIMENTARY" },
      { subscriptionStatus: { in: [...USABLE_SUBSCRIPTION_STATUSES] } },
    ],
  };
}
