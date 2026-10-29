import { describe, expect, it } from "vitest";

import { buildBillingHistory, formatMinorAmount } from "./billing-history";
import type { PaddleTransaction } from "./paddle/paddle-api";

function txn(overrides: Partial<PaddleTransaction> & { total?: string; card?: [string, string] | null }): PaddleTransaction {
  const { total = "3900", card = ["visa", "4242"], ...rest } = overrides;
  return {
    id: "txn_1",
    status: "completed",
    origin: "subscription_recurring",
    customer_id: "ctm_1",
    billed_at: "2026-10-27T12:00:00Z",
    created_at: "2026-10-27T12:00:00Z",
    currency_code: "EUR",
    details: { totals: { grand_total: total } },
    payments: card
      ? [{ status: "captured", method_details: { type: "card", card: { type: card[0], last4: card[1], expiry_month: 3, expiry_year: 2030 } } }]
      : [],
    ...rest,
  };
}

describe("buildBillingHistory", () => {
  it("lists charges newest first and takes the card from the newest card payment", () => {
    const history = buildBillingHistory(
      [txn({ id: "txn_new", card: ["mastercard", "4444"] }), txn({ id: "txn_old" })],
      "Europe/Budapest"
    );
    expect(history.card).toEqual({ brand: "Mastercard", last4: "4444", expires: "03/30" });
    expect(history.rows).toEqual([
      { id: "txn_new", date: "October 27, 2026", amount: "€39.00", status: "Paid" },
      { id: "txn_old", date: "October 27, 2026", amount: "€39.00", status: "Paid" },
    ]);
  });

  it("uses a card update for the card but doesn't list it as a charge", () => {
    const history = buildBillingHistory([
      txn({ id: "txn_update", origin: "subscription_payment_method_change", total: "0", card: ["visa", "1111"] }),
      txn({ id: "txn_paid", card: ["visa", "4242"] }),
    ]);
    expect(history.card?.last4).toBe("1111");
    expect(history.rows.map((row) => row.id)).toEqual(["txn_paid"]);
  });

  it("names a trial start and a failed payment for what they are", () => {
    const history = buildBillingHistory([txn({ id: "txn_failed", status: "past_due" }), txn({ id: "txn_trial", total: "0" })]);
    expect(history.rows.map((row) => row.status)).toEqual(["Payment failed", "Free trial"]);
  });

  it("has no card when nothing was paid by card", () => {
    expect(buildBillingHistory([txn({ card: null })]).card).toBeNull();
    expect(buildBillingHistory([]).rows).toEqual([]);
  });

  it("brands an unknown card type plainly", () => {
    expect(buildBillingHistory([txn({ card: ["something_new", "9999"] })]).card?.brand).toBe("Card");
  });
});

describe("formatMinorAmount", () => {
  it("reads minor units in the currency's own decimals", () => {
    expect(formatMinorAmount(86900, "EUR")).toBe("€869.00");
    expect(formatMinorAmount(4500, "JPY")).toBe("¥4,500");
  });
});
