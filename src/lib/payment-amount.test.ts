import { describe, expect, it } from "vitest";

import { parseAmountToCents } from "./payment-amount";

describe("parseAmountToCents", () => {
  it.each([
    ["85.50", 8550],
    ["85,50", 8550],
    ["85", 8500],
    ["85.5", 8550],
    ["00085,5", 8550],
    [" 85,50 ", 8550],
    ["0", 0],
    ["0.00", 0],
    ["0,01", 1],
    ["1.01", 101],
    ["999999.99", 99999999],
    ["1000000", 100000000],
    ["1000000.00", 100000000],
    ["1000000,00", 100000000],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it.each([
    "", " ", "abc", "85 EUR", "€85.50", "+85", "-0", "-85.50",
    "1e3", "1E3", "0x10", "NaN", "Infinity", "85.", "85,", ".50", ",50",
    "85.501", "85,501", "1,000", "1.000", "1,000.00", "1.000,00",
    "85..50", "85,,50", "85,5.0", "8 5", "1 000", "1\u00a0000", "８５.５０",
    "1000000.01", "1000000,01", "1000001", "999999999999999999999999",
  ])("rejects malformed or excessive amount %j", (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });
});
