import { describe, expect, it } from "vitest";

import { checkoutPriceId, checkoutStage, firstChargeLine } from "./checkout-state";

const PRICES = {
  BASIC: { MONTH: { trial: "pri_bm_t", noTrial: "pri_bm" }, YEAR: { trial: "pri_by_t", noTrial: "pri_by" } },
  PRO: { MONTH: { trial: "pri_pm_t", noTrial: "pri_pm" }, YEAR: { trial: "pri_py_t", noTrial: "pri_py" } },
};

const SUBSCRIPTION = {
  plan: "BASIC" as const,
  billingMode: "SUBSCRIPTION" as const,
  subscriptionStatus: "NONE" as const,
  cancelAt: null,
  trialEndsAt: null,
  lockedAt: null,
  trialUsedAt: null,
};

describe("checkoutStage", () => {
  it("asks a visitor to create an account, and a new account to set up its clinic", () => {
    expect(checkoutStage({ signedIn: false, business: null })).toEqual({ kind: "sign_up" });
    expect(checkoutStage({ signedIn: true, business: null })).toEqual({ kind: "onboarding" });
  });

  it("offers the free trial to a clinic that never had one", () => {
    expect(checkoutStage({ signedIn: true, business: SUBSCRIPTION })).toEqual({ kind: "subscribe", trialAvailable: true });
  });

  it("asks a clinic that already had its trial, or whose plan ended, to pay from day one (Review Focus 5)", () => {
    const used = { ...SUBSCRIPTION, trialUsedAt: new Date("2026-01-01T00:00:00Z") };
    expect(checkoutStage({ signedIn: true, business: used })).toEqual({ kind: "subscribe", trialAvailable: false });
    const locked = { ...used, subscriptionStatus: "CANCELED" as const };
    expect(checkoutStage({ signedIn: true, business: locked })).toEqual({ kind: "subscribe", trialAvailable: false });
  });

  it("sends a paying clinic to manage its plan instead of paying twice", () => {
    expect(checkoutStage({ signedIn: true, business: { ...SUBSCRIPTION, subscriptionStatus: "ACTIVE", plan: "PRO" } })).toEqual({
      kind: "subscribed",
      plan: "PRO",
    });
    expect(checkoutStage({ signedIn: true, business: { ...SUBSCRIPTION, subscriptionStatus: "PAST_DUE" } })).toMatchObject({
      kind: "subscribed",
    });
  });

  it("tells a free account it has nothing to pay", () => {
    expect(checkoutStage({ signedIn: true, business: { ...SUBSCRIPTION, billingMode: "COMPLIMENTARY" } })).toEqual({
      kind: "free_account",
    });
  });
});

describe("checkoutPriceId", () => {
  it("picks the trial price only while the trial is available", () => {
    expect(checkoutPriceId(PRICES, "PRO", "YEAR", true)).toBe("pri_py_t");
    expect(checkoutPriceId(PRICES, "PRO", "YEAR", false)).toBe("pri_py");
    expect(checkoutPriceId(PRICES, "BASIC", "MONTH", true)).toBe("pri_bm_t");
  });
});

describe("firstChargeLine", () => {
  const NOW = new Date("2026-10-26T12:00:00Z");

  it("says when the first charge happens and how much it is", () => {
    expect(firstChargeLine({ trialAvailable: true, price: "€39", interval: "MONTH", now: NOW, timeZone: "Europe/Budapest" })).toBe(
      "Free until November 9, 2026, then €39 a month. Cancel any time before and you pay nothing."
    );
    expect(firstChargeLine({ trialAvailable: true, price: "$869", interval: "YEAR", now: NOW, timeZone: "Europe/Budapest" })).toBe(
      "Free until November 9, 2026, then $869 a year. Cancel any time before and you pay nothing."
    );
  });

  it("says a clinic without a trial is charged today", () => {
    expect(firstChargeLine({ trialAvailable: false, price: "€429", interval: "YEAR", now: NOW, timeZone: "Europe/Budapest" })).toBe(
      "€429 today, then every year until you cancel."
    );
  });
});
