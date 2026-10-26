import { describe, expect, it } from "vitest";

import { priceLookup } from "./paddle-config";
import { type PaddleSubscription, subscriptionSnapshotUpdate } from "./subscription-snapshot";

const LOOKUP = priceLookup({
  BASIC: { MONTH: { trial: "pri_bm_t", noTrial: "pri_bm" }, YEAR: { trial: "pri_by_t", noTrial: "pri_by" } },
  PRO: { MONTH: { trial: "pri_pm_t", noTrial: "pri_pm" }, YEAR: { trial: "pri_py_t", noTrial: "pri_py" } },
});

const OCCURRED = new Date("2026-10-26T12:00:00Z");
const EXISTING = { billingMode: "SUBSCRIPTION" as const, trialUsedAt: null, lockedAt: new Date("2026-10-26T11:00:00Z") };

function sub(overrides: Partial<PaddleSubscription> = {}): PaddleSubscription {
  return {
    id: "sub_1",
    status: "trialing",
    customer_id: "ctm_1",
    custom_data: { businessId: "biz_1" },
    current_billing_period: { starts_at: "2026-10-26T12:00:00Z", ends_at: "2026-11-09T12:00:00Z" },
    scheduled_change: null,
    canceled_at: null,
    items: [
      {
        price: { id: "pri_bm_t" },
        trial_dates: { starts_at: "2026-10-26T12:00:00Z", ends_at: "2026-11-09T12:00:00Z" },
      },
    ],
    ...overrides,
  };
}

describe("subscriptionSnapshotUpdate", () => {
  it("maps a new trial: plan, interval, trial dates, one-trial marker, unlocked", () => {
    expect(subscriptionSnapshotUpdate(sub(), OCCURRED, LOOKUP, EXISTING)).toEqual({
      kind: "update",
      data: {
        billingMode: "SUBSCRIPTION",
        subscriptionStatus: "TRIALING",
        planStatus: "TRIALING",
        plan: "BASIC",
        subscribedPlan: "BASIC",
        billingInterval: "MONTH",
        paddleSubscriptionId: "sub_1",
        paddleCustomerId: "ctm_1",
        currentPeriodEndsAt: new Date("2026-11-09T12:00:00Z"),
        cancelAt: null,
        trialEndsAt: new Date("2026-11-09T12:00:00Z"),
        trialUsedAt: new Date("2026-10-26T12:00:00Z"),
        lockedAt: null,
        billingSyncedAt: OCCURRED,
      },
    });
  });

  it("keeps the first trial marker once set", () => {
    const used = new Date("2026-01-01T00:00:00Z");
    const result = subscriptionSnapshotUpdate(sub(), OCCURRED, LOOKUP, { ...EXISTING, trialUsedAt: used });
    expect(result.kind === "update" && result.data.trialUsedAt).toEqual(used);
  });

  it("maps an active yearly Pro subscription and a scheduled cancellation", () => {
    const result = subscriptionSnapshotUpdate(
      sub({
        status: "active",
        items: [{ price: { id: "pri_py" }, trial_dates: null }],
        scheduled_change: { action: "cancel", effective_at: "2027-10-26T12:00:00Z" },
      }),
      OCCURRED,
      LOOKUP,
      EXISTING
    );
    expect(result).toMatchObject({
      kind: "update",
      data: {
        subscriptionStatus: "ACTIVE",
        planStatus: "ACTIVE",
        plan: "PRO",
        billingInterval: "YEAR",
        cancelAt: new Date("2027-10-26T12:00:00Z"),
        trialUsedAt: null,
        lockedAt: null,
      },
    });
  });

  it("ignores a scheduled pause as a cancellation date", () => {
    const result = subscriptionSnapshotUpdate(
      sub({ status: "active", scheduled_change: { action: "pause", effective_at: "2026-12-01T00:00:00Z" } }),
      OCCURRED,
      LOOKUP,
      EXISTING
    );
    expect(result.kind === "update" && result.data.cancelAt).toBeNull();
  });

  it("keeps a past-due clinic usable", () => {
    const result = subscriptionSnapshotUpdate(sub({ status: "past_due" }), OCCURRED, LOOKUP, EXISTING);
    expect(result).toMatchObject({ kind: "update", data: { subscriptionStatus: "PAST_DUE", planStatus: "ACTIVE", lockedAt: null } });
  });

  it("locks a cancelled subscription from when Paddle cancelled it, and keeps an earlier lock time", () => {
    const canceled = sub({ status: "canceled", canceled_at: "2026-11-09T12:00:00Z" });
    expect(subscriptionSnapshotUpdate(canceled, OCCURRED, LOOKUP, { ...EXISTING, lockedAt: null })).toMatchObject({
      kind: "update",
      data: { subscriptionStatus: "CANCELED", planStatus: "CANCELED", lockedAt: new Date("2026-11-09T12:00:00Z") },
    });
    const earlier = new Date("2026-11-01T00:00:00Z");
    expect(subscriptionSnapshotUpdate(canceled, OCCURRED, LOOKUP, { ...EXISTING, lockedAt: earlier })).toMatchObject({
      data: { lockedAt: earlier },
    });
  });

  it("locks a paused subscription from the event time", () => {
    expect(subscriptionSnapshotUpdate(sub({ status: "paused" }), OCCURRED, LOOKUP, { ...EXISTING, lockedAt: null })).toMatchObject({
      data: { subscriptionStatus: "PAUSED", planStatus: "INACTIVE", lockedAt: OCCURRED },
    });
  });

  it("never changes whether a clinic is free: only the owner page does", () => {
    const free = { billingMode: "COMPLIMENTARY" as const, trialUsedAt: null, lockedAt: null };
    for (const status of ["active", "canceled"]) {
      expect(subscriptionSnapshotUpdate(sub({ status }), OCCURRED, LOOKUP, free)).toMatchObject({
        kind: "update",
        data: { billingMode: "COMPLIMENTARY", lockedAt: null },
      });
    }
  });

  it("is unmatched for a price this app doesn't sell or an unknown status", () => {
    expect(subscriptionSnapshotUpdate(sub({ items: [{ price: { id: "pri_other" }, trial_dates: null }] }), OCCURRED, LOOKUP, EXISTING)).toEqual({
      kind: "unmatched",
      reason: "unknown_price",
    });
    expect(subscriptionSnapshotUpdate(sub({ status: "mystery" }), OCCURRED, LOOKUP, EXISTING)).toEqual({
      kind: "unmatched",
      reason: "unknown_status",
    });
  });

  it("keeps a running Pro trial on Pro while Paddle bills Basic, and drops it once it has ended", () => {
    const active = { ...EXISTING, proTrialEndsAt: new Date("2026-11-01T00:00:00Z") };
    expect(subscriptionSnapshotUpdate(sub({ status: "active", items: [{ price: { id: "pri_bm" }, trial_dates: null }] }), OCCURRED, LOOKUP, active)).toMatchObject({
      data: { plan: "PRO", subscribedPlan: "BASIC" },
    });
    const ended = { ...EXISTING, proTrialEndsAt: new Date("2026-10-20T00:00:00Z") };
    expect(subscriptionSnapshotUpdate(sub({ status: "active", items: [{ price: { id: "pri_bm" }, trial_dates: null }] }), OCCURRED, LOOKUP, ended)).toMatchObject({
      data: { plan: "BASIC", subscribedPlan: "BASIC" },
    });
  });
});
