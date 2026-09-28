import { describe, expect, it } from "vitest";

import { MAX_PAYMENT_AMOUNT_MAJOR_UNITS, parseAmountToCents } from "@/lib/payment-amount";

describe("parseAmountToCents", () => {
  it.each([
    ["42.50", 4250],
    ["0", 0],
    ["0.00", 0],
    ["19.99", 1999],
    ["85", 8500],
    ["85.", 8500],
    [".5", 50],
    ["  85.00  ", 8500],
    // thousands grouped the way the app displays money
    ["1,200", 120000],
    ["1,200.50", 120050],
    ["12,345,678.90", 1234567890],
    // currency symbols, codes and locale spaces around the number are ignored
    ["€85", 8500],
    ["$1,000", 100000],
    ["85 €", 8500],
    ["85 EUR", 8500],
    ["EUR 85.50", 8550],
    ["1 200,50", 120050],
    ["1 200,50", 120050],
    // a decimal comma, as typed in much of the Balkans/Europe
    ["12,50", 1250],
    ["0,5", 50],
    ["85,00", 8500],
  ])("reads %j as %i cents", (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  // CodeRabbit #131: these used to be scrubbed into a different, valid amount.
  it.each([
    ["−05", "a pasted Unicode minus"],
    ["-5", "an ASCII minus"],
    ["+5", "an explicit plus"],
    ["1.200,50", "European dot-grouping with a decimal comma"],
    ["1,200,50", "a comma both grouping and separating cents"],
    ["1.2.3", "two decimal points"],
    ["1e5", "an exponent"],
    ["12abc", "trailing letters that are not a currency code"],
    ["0.001", "finer than a cent"],
    ["1.005", "finer than a cent"],
    ["abc", "no digits at all"],
    ["", "an empty field"],
    ["   ", "only spaces"],
    ["€", "only a currency symbol"],
    ["-", "only a minus"],
    [".", "only a point"],
    [",", "only a comma"],
    // CodeRabbit #131 round 3: an internal separator only counts once it forms
    // a real group or decimal comma — not anywhere a digit meets whitespace or
    // a currency marker.
    ["12 50", "a space that isn't a thousands group"],
    ["12€50", "a currency symbol in the middle, not at an end"],
    ["EUR 85 USD", "two conflicting currency markers"],
    ["85 EUR USD", "a currency code repeated at the same end"],
    ["¥85", "a currency symbol for a currency this app doesn't support"],
  ])("rejects %j (%s)", (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });

  describe("expectedCurrency", () => {
    it("accepts a marker that matches the workspace currency", () => {
      expect(parseAmountToCents("85 EUR", "EUR")).toBe(8500);
      expect(parseAmountToCents("€85", "EUR")).toBe(8500);
    });

    it("rejects a marker for a different currency, even though the amount alone is valid", () => {
      // Codex-adjacent: "85 USD" typed into a euro workspace must not silently
      // become 85 euros.
      expect(parseAmountToCents("85 USD", "EUR")).toBeNull();
      expect(parseAmountToCents("$85", "EUR")).toBeNull();
    });

    it("still accepts a bare number with no marker at all", () => {
      expect(parseAmountToCents("85", "EUR")).toBe(8500);
    });
  });

  it("never reads a decimal-comma amount as a hundred times larger", () => {
    expect(parseAmountToCents("12,50")).not.toBe(125000);
    expect(parseAmountToCents("12,50")).toBe(1250);
  });

  // Codex #131: the old fixed "> 1,000,000" ceiling was USD/EUR-shaped and
  // wrongly rejected a perfectly ordinary amount in a lower-value currency
  // like HUF (e.g. a HUF 1,200,000 visit, well under the storage bound).
  it("accepts a legitimate large amount in a lower-value currency (e.g. HUF)", () => {
    expect(parseAmountToCents("1200000")).toBe(120000000);
    expect(parseAmountToCents("1,200,000")).toBe(120000000);
  });

  it("still rejects an absurd fat-finger amount, regardless of currency", () => {
    expect(parseAmountToCents("999999999")).toBeNull();
    expect(parseAmountToCents(String(MAX_PAYMENT_AMOUNT_MAJOR_UNITS + 1))).toBeNull();
  });

  it("stays under the Int32 column bound at its own ceiling", () => {
    const cents = parseAmountToCents(String(MAX_PAYMENT_AMOUNT_MAJOR_UNITS));

    expect(cents).not.toBeNull();
    expect(cents!).toBeLessThan(2_147_483_647);
  });
});
