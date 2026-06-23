import { describe, expect, it } from "vitest";

import { formatCurrency, getInitials } from "@/lib/utils";

describe("formatCurrency", () => {
  it("formats cents as USD with two decimals by default", () => {
    expect(formatCurrency(123456)).toBe("$1,234.56");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(99)).toBe("$0.99");
  });

  it("rounds to whole dollars when { whole: true }", () => {
    expect(formatCurrency(123456, { whole: true })).toBe("$1,235");
    expect(formatCurrency(9949, { whole: true })).toBe("$99");
    expect(formatCurrency(9950, { whole: true })).toBe("$100");
  });

  it("handles negative amounts (refunds/adjustments)", () => {
    expect(formatCurrency(-500)).toBe("-$5.00");
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
