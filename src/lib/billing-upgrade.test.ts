import { describe, expect, it, vi } from "vitest";

const preview = vi.hoisted(() => vi.fn());
vi.mock("@/lib/paddle/paddle-api", () => ({ previewPaddleSubscriptionChange: preview }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import type { PaddleConfig } from "@/lib/paddle/paddle-config";

import { upgradePath, upgradeQuote, type UpgradeSource } from "./billing-upgrade";

const NOW = new Date("2026-11-09T12:00:00Z");

const PAYING_BASIC: UpgradeSource = {
  billingMode: "SUBSCRIPTION",
  subscriptionStatus: "ACTIVE",
  plan: "BASIC",
  subscribedPlan: "BASIC",
  cancelAt: null,
  paddleSubscriptionId: "sub_1",
};

const kind = (overrides: Partial<UpgradeSource>) => upgradePath({ ...PAYING_BASIC, ...overrides }, NOW).kind;

describe("upgradePath", () => {
  it("moves a clinic paying for Basic to Pro, charging the difference now", () => {
    expect(kind({})).toBe("change");
  });

  it("ends Basic's free trial: Pro is paid from day one", () => {
    expect(kind({ subscriptionStatus: "TRIALING" })).toBe("end_trial");
  });

  it("charges for Pro during an owner-offered Pro trial, since Paddle still bills Basic", () => {
    expect(kind({ plan: "PRO", subscribedPlan: "BASIC" })).toBe("change");
  });

  it("has nothing to do when Paddle already bills Pro", () => {
    expect(kind({ plan: "PRO", subscribedPlan: "PRO" })).toBe("already_pro");
    expect(kind({ plan: "PRO", subscribedPlan: null })).toBe("already_pro");
  });

  it("asks to resume a plan set to end, or fix a failing card, first", () => {
    expect(kind({ cancelAt: new Date("2026-11-20T00:00:00Z") })).toBe("resume_first");
    expect(kind({ subscriptionStatus: "PAST_DUE" })).toBe("card_first");
  });

  it("ignores a cancellation date that has already passed", () => {
    expect(kind({ cancelAt: new Date("2026-11-01T00:00:00Z") })).toBe("change");
  });

  it("sends a clinic with no running subscription to the normal checkout", () => {
    expect(kind({ subscriptionStatus: "NONE", paddleSubscriptionId: null })).toBe("subscribe");
    expect(kind({ subscriptionStatus: "CANCELED" })).toBe("subscribe");
  });

  it("recognises a clinic the owner made free", () => {
    expect(kind({ billingMode: "COMPLIMENTARY", subscriptionStatus: "NONE", paddleSubscriptionId: null })).toBe("free");
  });
});

describe("upgradeQuote", () => {
  const CONFIG = {
    prices: {
      BASIC: { MONTH: { trial: "pri_bm_t", noTrial: "pri_bm" }, YEAR: { trial: "pri_by_t", noTrial: "pri_by" } },
      PRO: { MONTH: { trial: "pri_pm_t", noTrial: "pri_pm" }, YEAR: { trial: "pri_py_t", noTrial: "pri_py" } },
    },
  } as unknown as PaddleConfig;
  const quote = (kind: "change" | "end_trial", interval: "MONTH" | "YEAR" = "MONTH") =>
    upgradeQuote(CONFIG, "sub_1", { kind }, interval, "en", "UTC", NOW);

  it("prints what Paddle charges now and Pro's own price, not the recurring total after credit", async () => {
    // After a recent downgrade the account holds credit: nothing is due today, and
    // Paddle's recurring grand total has that credit taken off (35 instead of 80).
    preview.mockResolvedValueOnce({
      currency_code: "EUR",
      next_billed_at: "2026-12-09T03:25:37Z",
      immediate_transaction: { details: { totals: { grand_total: "0" } } },
      recurring_transaction_details: { totals: { total: "8000", grand_total: "3500" } },
    });
    expect(await quote("change")).toEqual({
      dueToday: "€0.00",
      nothingDue: true,
      recurring: "€80.00",
      nextOn: "December 9, 2026",
      approved: { currency: "EUR", dueMinor: 0, recurringMinor: 8000 },
    });
    expect(preview).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_pm", { trialing: false });
  });

  it("charges the prorated difference for a clinic paying for Basic", async () => {
    preview.mockResolvedValueOnce({
      currency_code: "EUR",
      next_billed_at: "2026-12-09T03:25:37Z",
      immediate_transaction: { details: { totals: { grand_total: "4500" } } },
      recurring_transaction_details: { totals: { total: "8000" } },
    });
    expect(await quote("change")).toMatchObject({ dueToday: "€45.00", nothingDue: false, recurring: "€80.00" });
  });

  it("charges Pro in full today when it ends a trial, next due one period on", async () => {
    preview.mockResolvedValueOnce({
      currency_code: "EUR",
      next_billed_at: "2026-11-23T03:22:20Z",
      immediate_transaction: null,
      recurring_transaction_details: { totals: { total: "85000" } },
    });
    expect(await quote("end_trial", "YEAR")).toEqual({
      dueToday: "€850.00",
      nothingDue: false,
      recurring: "€850.00",
      nextOn: "November 9, 2027",
      approved: { currency: "EUR", dueMinor: 85000, recurringMinor: 85000 },
    });
    expect(preview).toHaveBeenLastCalledWith(CONFIG, "sub_1", "pri_py", { trialing: true });
  });

  it("offers nothing to pay when Paddle can't answer", async () => {
    preview.mockRejectedValueOnce(new Error("timeout"));
    expect(await quote("change")).toBeNull();
    preview.mockResolvedValueOnce({ currency_code: "EUR", next_billed_at: null, immediate_transaction: null, recurring_transaction_details: null });
    expect(await quote("change")).toBeNull();
  });
});

describe("upgradeQuote dates", () => {
  it("clamps the next charge to the month's last day when a trial ends on the 31st", async () => {
    preview.mockResolvedValueOnce({
      currency_code: "EUR",
      next_billed_at: null,
      immediate_transaction: null,
      recurring_transaction_details: { totals: { total: "8000" } },
    });
    const config = { prices: { PRO: { MONTH: { noTrial: "pri_pm" } } } } as unknown as PaddleConfig;
    const result = await upgradeQuote(config, "sub_1", { kind: "end_trial" }, "MONTH", "en", "UTC", new Date("2027-01-31T12:00:00Z"));
    expect(result?.nextOn).toBe("February 28, 2027");
  });
});
