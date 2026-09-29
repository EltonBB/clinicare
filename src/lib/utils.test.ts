import { describe, expect, it } from "vitest";

import { formatCurrency, getInitials, sumMergedIntervals } from "@/lib/utils";

describe("formatCurrency", () => {
  it("formats cents with two decimals by default", () => {
    expect(formatCurrency(123456, "USD")).toBe("$1,234.56");
    expect(formatCurrency(0, "USD")).toBe("$0.00");
    expect(formatCurrency(99, "USD")).toBe("$0.99");
  });

  it("uses the clinic's currency symbol, not dollars", () => {
    expect(formatCurrency(123456, "EUR")).toBe("€1,234.56");
    expect(formatCurrency(123456, "GBP")).toBe("£1,234.56");
    expect(formatCurrency(5000, "EUR")).not.toContain("$");
  });

  it("names the currency when it has no short symbol", () => {
    expect(formatCurrency(123456, "ALL")).toContain("ALL");
    expect(formatCurrency(123456, "CHF")).toContain("CHF");
  });

  it("rounds to whole units when { whole: true }", () => {
    expect(formatCurrency(123456, "USD", { whole: true })).toBe("$1,235");
    expect(formatCurrency(9949, "USD", { whole: true })).toBe("$99");
    expect(formatCurrency(9950, "USD", { whole: true })).toBe("$100");
    expect(formatCurrency(123456, "EUR", { whole: true })).toBe("€1,235");
  });

  it("handles negative amounts (refunds/adjustments)", () => {
    expect(formatCurrency(-500, "USD")).toBe("-$5.00");
    expect(formatCurrency(-500, "EUR")).toBe("-€5.00");
  });

  it("reads a missing or unsupported stored currency as the default (euro) instead of throwing", () => {
    expect(formatCurrency(5000, undefined)).toBe("€50.00");
    expect(formatCurrency(5000, null)).toBe("€50.00");
    expect(formatCurrency(5000, "")).toBe("€50.00");
    expect(formatCurrency(5000, "not-a-currency")).toBe("€50.00");
  });
});

describe("getInitials", () => {
  it("takes first + last initial", () => {
    expect(getInitials("Fatjona Rexhepi")).toBe("FR");
    expect(getInitials("  john   doe  ")).toBe("JD");
  });

  it("handles a single name part", () => {
    expect(getInitials("Madonna")).toBe("M");
    expect(getInitials("a")).toBe("A");
  });
});

describe("sumMergedIntervals", () => {
  it("sums non-overlapping intervals directly", () => {
    expect(
      sumMergedIntervals([
        { start: 0, end: 10 },
        { start: 20, end: 25 },
      ])
    ).toBe(15);
  });

  it("merges overlapping intervals instead of double-counting the shared span", () => {
    // 0-10 and 5-15 overlap on 5-10 — the real union is 0-15 (length 15), not
    // 10 + 10 = 20. This is the exact bug two overlapping ScheduleBlocks hit.
    expect(
      sumMergedIntervals([
        { start: 0, end: 10 },
        { start: 5, end: 15 },
      ])
    ).toBe(15);
  });

  it("merges touching intervals (end of one equals start of the next)", () => {
    expect(
      sumMergedIntervals([
        { start: 0, end: 10 },
        { start: 10, end: 20 },
      ])
    ).toBe(20);
  });

  it("collapses a fully-nested interval into its container", () => {
    expect(
      sumMergedIntervals([
        { start: 0, end: 20 },
        { start: 5, end: 10 },
      ])
    ).toBe(20);
  });

  it("doesn't depend on input order", () => {
    expect(
      sumMergedIntervals([
        { start: 20, end: 25 },
        { start: 0, end: 10 },
      ])
    ).toBe(15);
  });

  it("drops zero/negative-length intervals", () => {
    expect(
      sumMergedIntervals([
        { start: 5, end: 5 },
        { start: 10, end: 8 },
        { start: 0, end: 3 },
      ])
    ).toBe(3);
  });

  it("returns 0 for an empty list", () => {
    expect(sumMergedIntervals([])).toBe(0);
  });
});
