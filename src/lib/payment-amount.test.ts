import { describe, expect, it } from "vitest";

import { parseAmountToCents } from "@/lib/payment-amount";

describe("parseAmountToCents", () => {
  it("parses a plain amount into integer cents", () => {
    expect(parseAmountToCents("42.50")).toBe(4250);
    expect(parseAmountToCents("0")).toBe(0);
  });

  it("strips currency symbols and thousands separators before parsing", () => {
    expect(parseAmountToCents("€1,200.00".replace(/,/g, ""))).toBe(120000);
  });

  it("rejects negative amounts", () => {
    expect(parseAmountToCents("-5")).toBeNull();
  });

  it("rejects unparseable numeric-looking input", () => {
    expect(parseAmountToCents("1.2.3")).toBeNull();
  });

  it("rejects input with no digits rather than reading it as zero", () => {
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("€")).toBeNull();
    expect(parseAmountToCents("-")).toBeNull();
    expect(parseAmountToCents(".")).toBeNull();
  });

  // Codex #131: the old fixed "> 1,000,000" ceiling was USD/EUR-shaped and
  // wrongly rejected a perfectly ordinary amount in a lower-value currency
  // like HUF (e.g. a HUF 1,200,000 visit, well under the storage bound).
  it("accepts a legitimate large amount in a lower-value currency (e.g. HUF)", () => {
    expect(parseAmountToCents("1200000")).toBe(120000000);
  });

  it("still rejects an absurd fat-finger amount, regardless of currency", () => {
    expect(parseAmountToCents("999999999")).toBeNull();
  });

  it("stays under the Int32 column bound at its own ceiling", () => {
    const cents = parseAmountToCents("20000000");
    expect(cents).not.toBeNull();
    expect(cents!).toBeLessThan(2_147_483_647);
  });
});
