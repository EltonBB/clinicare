import { describe, expect, it } from "vitest";

import { buildBillingSummary, type BillingSummarySource } from "./billing-summary";

const NOW = new Date("2026-10-26T12:00:00Z");
const ZONE = "Europe/Budapest";

function business(overrides: Partial<BillingSummarySource>): BillingSummarySource {
  return {
    plan: "BASIC",
    billingMode: "SUBSCRIPTION",
    subscriptionStatus: "ACTIVE",
    billingInterval: "MONTH",
    currentPeriodEndsAt: new Date("2026-11-20T10:00:00Z"),
    cancelAt: null,
    trialEndsAt: null,
    lockedAt: null,
    paddleCustomerId: "ctm_1",
    ...overrides,
  };
}

const summary = (overrides: Partial<BillingSummarySource>, billingEnabled = true) =>
  buildBillingSummary(business(overrides), { billingEnabled, now: NOW, timeZone: ZONE });

describe("buildBillingSummary", () => {
  it("describes a free account with nothing to manage", () => {
    expect(summary({ billingMode: "COMPLIMENTARY", subscriptionStatus: "NONE", paddleCustomerId: null })).toMatchObject({
      kind: "free",
      statusLabel: "Free account",
      note: "Your clinic uses Vela free of charge.",
      canManage: false,
      changeOptions: [],
    });
  });

  it("describes an active monthly plan, with management and the three other plans to switch to", () => {
    const result = summary({});
    expect(result).toMatchObject({
      kind: "subscribed",
      planName: "Basic",
      statusLabel: "Active",
      note: "Renews on November 20, 2026, billed monthly.",
      canManage: true,
    });
    expect(result.changeOptions.map((option) => option.label)).toEqual([
      "Basic, billed yearly",
      "Pro, billed monthly",
      "Pro, billed yearly",
    ]);
    expect(result.changeOptions.find((option) => option.label === "Pro, billed monthly")?.effect).toBe(
      "You're charged the difference for the rest of this period now."
    );
  });

  it("says a move between monthly and yearly starts a new, paid period today", () => {
    const yearly = "A new billing period starts today. You pay for it now, less the unused part of this one.";
    expect(summary({}).changeOptions.find((option) => option.label === "Basic, billed yearly")?.effect).toBe(yearly);
    const pro = summary({ plan: "PRO", billingInterval: "YEAR" });
    expect(pro.changeOptions.find((option) => option.label === "Basic, billed monthly")?.effect).toBe(yearly);
  });

  it("credits a move to a cheaper plan", () => {
    const pro = summary({ plan: "PRO" });
    expect(pro.changeOptions.find((option) => option.plan === "BASIC" && option.interval === "MONTH")?.effect).toBe(
      "The unused part of this period is credited to your next bill."
    );
  });

  it("says nothing is charged when switching during the trial", () => {
    const trial = summary({ subscriptionStatus: "TRIALING", trialEndsAt: new Date("2026-11-09T12:00:00Z") });
    expect(trial).toMatchObject({ statusLabel: "Free trial", note: "Free until November 9, 2026, then billed monthly." });
    expect(trial.changeOptions.every((option) => option.effect === "Nothing is charged before your trial ends.")).toBe(true);
  });

  it("asks for a new card while a payment is failing", () => {
    expect(summary({ subscriptionStatus: "PAST_DUE" })).toMatchObject({
      statusLabel: "Payment failed",
      note: "Your last payment didn't go through. Update your card to keep using Vela.",
      canManage: true,
      changeOptions: [],
    });
  });

  it("shows a scheduled end and offers no switch until it's resumed", () => {
    expect(summary({ cancelAt: new Date("2026-11-20T10:00:00Z") })).toMatchObject({
      statusLabel: "Ending",
      note: "Your plan ends on November 20, 2026. Resume it from Manage billing to keep using Vela.",
      changeOptions: [],
    });
  });

  it("sends a clinic without a plan, or whose plan ended, to choose one", () => {
    expect(summary({ subscriptionStatus: "NONE", paddleCustomerId: null })).toMatchObject({
      kind: "needs_plan",
      statusLabel: "No plan yet",
      canManage: false,
    });
    expect(summary({ subscriptionStatus: "CANCELED", lockedAt: new Date("2026-10-20T08:00:00Z") })).toMatchObject({
      kind: "locked",
      statusLabel: "Ended",
      note: "Your plan has ended, so the workspace is read-only. Your records are kept until January 18, 2027.",
      // The ended subscription's invoices are still reachable.
      canManage: true,
      changeOptions: [],
    });
  });

  it("offers no management while billing is switched off", () => {
    expect(summary({}, false)).toMatchObject({ canManage: false, changeOptions: [] });
  });
});
