import { describe, expect, it } from "vitest";

import {
  currencyLabel,
  DEFAULT_CURRENCY,
  isSupportedCurrency,
  normalizeCurrency,
  SUPPORTED_CURRENCIES,
} from "@/lib/currency";
import { formatCurrency } from "@/lib/utils";

describe("supported currencies", () => {
  it("defaults to the euro (the pilot market's currency)", () => {
    expect(DEFAULT_CURRENCY).toBe("EUR");
    expect(SUPPORTED_CURRENCIES[0].code).toBe("EUR");
  });

  it("lists each currency once, as an upper-case ISO 4217 code", () => {
    const codes = SUPPORTED_CURRENCIES.map((currency) => currency.code);

    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("shows the cents of a stored amount in every supported currency (some ICU defaults would drop them)", () => {
    for (const { code } of SUPPORTED_CURRENCIES) {
      expect(formatCurrency(123456, code), code).toContain("1,234.56");
      expect(formatCurrency(123456, code, { whole: true }), code).toContain("1,235");
    }
  });
});

describe("isSupportedCurrency", () => {
  it("accepts the listed codes and nothing else", () => {
    expect(isSupportedCurrency("EUR")).toBe(true);
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("eur")).toBe(false);
    expect(isSupportedCurrency("JPY")).toBe(false); // zero-decimal: cents math would be wrong
    expect(isSupportedCurrency("")).toBe(false);
    expect(isSupportedCurrency(null)).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
    expect(isSupportedCurrency({ not: "EUR" })).toBe(false);
    expect(isSupportedCurrency(["EUR"])).toBe(false);
  });
});

describe("normalizeCurrency", () => {
  it("keeps a supported code", () => {
    expect(normalizeCurrency("GBP")).toBe("GBP");
  });

  it("falls back to the default for anything stored that isn't supported", () => {
    expect(normalizeCurrency("XXX")).toBe("EUR");
    expect(normalizeCurrency("")).toBe("EUR");
    expect(normalizeCurrency(null)).toBe("EUR");
    expect(normalizeCurrency(undefined)).toBe("EUR");
  });
});

describe("currencyLabel", () => {
  it("names the currency and shows its code", () => {
    expect(currencyLabel("EUR")).toBe("Euro (EUR)");
    expect(currencyLabel("USD")).toBe("US dollar (USD)");
  });

  it("falls back to the bare code for one that isn't listed", () => {
    expect(currencyLabel("XXX")).toBe("XXX");
  });
});
