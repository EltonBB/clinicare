import { describe, expect, it } from "vitest";

import {
  type BillingSnapshot,
  canUseWorkspace,
  RETENTION_DAYS,
  retentionEndsAt,
  USABLE_SUBSCRIPTION_STATUSES,
  workspaceAccess,
  workspaceUsableWhere,
} from "./billing-access";

const NOW = new Date("2026-10-26T12:00:00Z");
const LATER = new Date("2026-11-09T12:00:00Z");

// What `db push` gives a workspace that existed before billing shipped.
const DEFAULT_ROW: BillingSnapshot = {
  billingMode: "COMPLIMENTARY",
  subscriptionStatus: "NONE",
  cancelAt: null,
  trialEndsAt: null,
  lockedAt: null,
};

function subscription(overrides: Partial<BillingSnapshot>): BillingSnapshot {
  return { ...DEFAULT_ROW, billingMode: "SUBSCRIPTION", ...overrides };
}

describe("workspaceAccess", () => {
  it("keeps a workspace that predates billing fully usable", () => {
    expect(workspaceAccess(DEFAULT_ROW, NOW)).toEqual({ kind: "full", notice: null });
  });

  it("keeps a free account usable whatever its subscription fields say", () => {
    const free = { ...DEFAULT_ROW, subscriptionStatus: "CANCELED" as const, lockedAt: NOW };
    expect(canUseWorkspace(free, NOW)).toBe(true);
  });

  it("sends a paying-mode workspace without a subscription to choose a plan", () => {
    expect(workspaceAccess(subscription({ subscriptionStatus: "NONE" }), NOW)).toEqual({ kind: "needs_plan" });
  });

  it("is usable while trialing, and says when the trial ends", () => {
    expect(workspaceAccess(subscription({ subscriptionStatus: "TRIALING", trialEndsAt: LATER }), NOW)).toEqual({
      kind: "full",
      notice: { kind: "trial", endsAt: LATER },
    });
  });

  it("is usable while active, with no notice", () => {
    expect(workspaceAccess(subscription({ subscriptionStatus: "ACTIVE" }), NOW)).toEqual({ kind: "full", notice: null });
  });

  it("stays usable while a failed payment is being retried, with a notice", () => {
    expect(workspaceAccess(subscription({ subscriptionStatus: "PAST_DUE" }), NOW)).toEqual({
      kind: "full",
      notice: { kind: "past_due" },
    });
  });

  it("says when a scheduled cancellation takes effect, ahead of the trial notice", () => {
    expect(
      workspaceAccess(subscription({ subscriptionStatus: "TRIALING", trialEndsAt: LATER, cancelAt: LATER }), NOW)
    ).toEqual({ kind: "full", notice: { kind: "ending", endsAt: LATER } });
  });

  it("ignores a scheduled cancellation that is already in the past", () => {
    const past = new Date("2026-10-01T00:00:00Z");
    expect(workspaceAccess(subscription({ subscriptionStatus: "ACTIVE", cancelAt: past }), NOW)).toEqual({
      kind: "full",
      notice: null,
    });
  });

  it.each(["CANCELED", "PAUSED"] as const)("locks a %s subscription and keeps the data 90 days", (status) => {
    const lockedAt = new Date("2026-10-20T08:00:00Z");
    expect(workspaceAccess(subscription({ subscriptionStatus: status, lockedAt }), NOW)).toEqual({
      kind: "locked",
      keptUntil: new Date("2027-01-18T08:00:00Z"),
    });
  });

  it("locks without a retention date when the lock time is unknown", () => {
    expect(workspaceAccess(subscription({ subscriptionStatus: "CANCELED" }), NOW)).toEqual({
      kind: "locked",
      keptUntil: null,
    });
  });
});

describe("retentionEndsAt", () => {
  it("is RETENTION_DAYS after the lock", () => {
    expect(RETENTION_DAYS).toBe(90);
    expect(retentionEndsAt(new Date("2026-10-20T08:00:00Z"))).toEqual(new Date("2027-01-18T08:00:00Z"));
  });
});

describe("workspaceUsableWhere", () => {
  it("matches free accounts and exactly the usable subscription statuses", () => {
    expect(USABLE_SUBSCRIPTION_STATUSES).toEqual(["TRIALING", "ACTIVE", "PAST_DUE"]);
    expect(workspaceUsableWhere()).toEqual({
      OR: [
        { billingMode: "COMPLIMENTARY" },
        { subscriptionStatus: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
      ],
    });
  });

  it("agrees with canUseWorkspace for every status", () => {
    const statuses = ["NONE", "TRIALING", "ACTIVE", "PAST_DUE", "PAUSED", "CANCELED"] as const;
    for (const status of statuses) {
      const usable = canUseWorkspace(subscription({ subscriptionStatus: status }), NOW);
      expect(usable).toBe((USABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status));
    }
  });
});
