import { describe, expect, it } from "vitest";

import {
  PRO_TRIAL_DAYS,
  proTrialEndedAt,
  proTrialOfferOpensAt,
  proTrialState,
  type ProTrialSource,
} from "./pro-trial";

const NOW = new Date("2026-10-26T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY);

function clinic(overrides: Partial<ProTrialSource> = {}): ProTrialSource {
  return {
    plan: "BASIC",
    subscribedPlan: "BASIC",
    billingMode: "SUBSCRIPTION",
    subscriptionStatus: "ACTIVE",
    cancelAt: null,
    proTrialOfferedAt: daysFromNow(-1),
    proTrialStartedAt: null,
    proTrialEndsAt: null,
    ...overrides,
  };
}

describe("proTrialOfferOpensAt", () => {
  it("opens the offer 30 days after Basic's first paid charge", () => {
    expect(proTrialOfferOpensAt(NOW)).toEqual(daysFromNow(30));
  });
});

describe("proTrialState", () => {
  it("is offered to a clinic paying for Basic once its offer date has come", () => {
    expect(PRO_TRIAL_DAYS).toBe(14);
    expect(proTrialState(clinic(), NOW)).toEqual({ kind: "offered" });
    expect(proTrialState(clinic({ proTrialOfferedAt: NOW }), NOW)).toEqual({ kind: "offered" });
  });

  it("isn't offered before 30 days of paid Basic, or with no offer date yet", () => {
    expect(proTrialState(clinic({ proTrialOfferedAt: daysFromNow(3) }), NOW)).toEqual({ kind: "none" });
    expect(proTrialState(clinic({ proTrialOfferedAt: null }), NOW)).toEqual({ kind: "none" });
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

  it("is running until its end, and over afterwards (offered once, started once)", () => {
    const endsAt = new Date("2026-11-09T12:00:00Z");
    const started = clinic({ plan: "PRO", proTrialStartedAt: NOW, proTrialEndsAt: endsAt });
    expect(proTrialState(started, NOW)).toEqual({ kind: "active", endsAt });
    expect(proTrialState({ ...started, plan: "BASIC" }, new Date("2026-11-10T00:00:00Z"))).toEqual({ kind: "none" });
  });
});

describe("proTrialEndedAt", () => {
  const startedAt = daysFromNow(-15);
  const endsAt = daysFromNow(-1);
  const ran = clinic({ proTrialStartedAt: startedAt, proTrialEndsAt: endsAt });

  it("asks once a full trial has run out and the clinic is back on Basic", () => {
    expect(proTrialEndedAt(ran, NOW)).toEqual(endsAt);
  });

  it("asks right away, before the hourly sweep has moved the plan back", () => {
    expect(proTrialEndedAt({ ...ran, plan: "PRO" }, NOW)).toEqual(endsAt);
  });

  it("doesn't ask while it runs, after an early end, once paid for Pro, or after a week", () => {
    expect(proTrialEndedAt(clinic({ proTrialStartedAt: NOW, proTrialEndsAt: daysFromNow(14) }), NOW)).toBeNull();
    // Back to Basic (or paid for Pro) ends it early: shorter than 14 days.
    expect(proTrialEndedAt(clinic({ proTrialStartedAt: startedAt, proTrialEndsAt: daysFromNow(-5) }), NOW)).toBeNull();
    expect(proTrialEndedAt({ ...ran, plan: "PRO", subscribedPlan: "PRO" }, NOW)).toBeNull();
    expect(proTrialEndedAt(ran, daysFromNow(7))).toBeNull();
    expect(proTrialEndedAt(clinic(), NOW)).toBeNull();
  });
});
