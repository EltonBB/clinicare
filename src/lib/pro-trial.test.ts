import { describe, expect, it } from "vitest";

import { PRO_TRIAL_DAYS, proTrialState, type ProTrialSource } from "./pro-trial";

const NOW = new Date("2026-10-26T12:00:00Z");

function clinic(overrides: Partial<ProTrialSource> = {}): ProTrialSource {
  return {
    plan: "BASIC",
    subscribedPlan: "BASIC",
    billingMode: "SUBSCRIPTION",
    subscriptionStatus: "ACTIVE",
    cancelAt: null,
    proTrialOfferedAt: null,
    proTrialStartedAt: null,
    proTrialEndsAt: null,
    ...overrides,
  };
}

describe("proTrialState", () => {
  it("lets the owner offer it to a paying Basic clinic", () => {
    expect(PRO_TRIAL_DAYS).toBe(14);
    expect(proTrialState(clinic(), NOW)).toEqual({ kind: "offerable" });
  });

  it("is never offered to a free, trialing, failing, ending, Pro or locked clinic", () => {
    for (const overrides of [
      { billingMode: "COMPLIMENTARY" as const },
      { subscriptionStatus: "TRIALING" as const },
      { subscriptionStatus: "PAST_DUE" as const },
      { subscriptionStatus: "CANCELED" as const },
      { cancelAt: new Date("2026-11-20T00:00:00Z") },
      { plan: "PRO" as const, subscribedPlan: "PRO" as const },
    ]) {
      expect(proTrialState(clinic(overrides), NOW)).toEqual({ kind: "none" });
    }
  });

  it("waits for the clinic once offered", () => {
    expect(proTrialState(clinic({ proTrialOfferedAt: NOW }), NOW)).toEqual({ kind: "offered" });
  });

  it("is running until its end, and over afterwards (offered once, started once)", () => {
    const endsAt = new Date("2026-11-09T12:00:00Z");
    const started = clinic({ plan: "PRO", proTrialOfferedAt: NOW, proTrialStartedAt: NOW, proTrialEndsAt: endsAt });
    expect(proTrialState(started, NOW)).toEqual({ kind: "active", endsAt });
    expect(proTrialState({ ...started, plan: "BASIC" }, new Date("2026-11-10T00:00:00Z"))).toEqual({ kind: "none" });
  });
});
