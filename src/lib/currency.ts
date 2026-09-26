/**
 * The currencies a clinic can bill in. Amounts are stored as integer cents, so
 * only currencies whose ISO 4217 minor unit is 1/100 belong here (a zero-decimal
 * one like JPY would show a hundredth of its real value); isSupportedCurrency
 * rejects those.
 *
 * The euro is the default: the pilot market (Kosovo, then the Balkans and
 * Europe) bills in it. Stored on `Business.currency` and changed in
 * Settings > Business details.
 */
export const SUPPORTED_CURRENCIES = [
  { code: "EUR", name: "Euro" },
  { code: "USD", name: "US dollar" },
  { code: "GBP", name: "British pound" },
  { code: "CHF", name: "Swiss franc" },
  { code: "ALL", name: "Albanian lek" },
  { code: "MKD", name: "Macedonian denar" },
  { code: "RSD", name: "Serbian dinar" },
  { code: "BAM", name: "Bosnia-Herzegovina convertible mark" },
  { code: "BGN", name: "Bulgarian lev" },
  { code: "RON", name: "Romanian leu" },
  { code: "HUF", name: "Hungarian forint" },
  { code: "PLN", name: "Polish zloty" },
  { code: "CZK", name: "Czech koruna" },
  { code: "TRY", name: "Turkish lira" },
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: SupportedCurrency = "EUR";

export function isSupportedCurrency(code: unknown): code is SupportedCurrency {
  return SUPPORTED_CURRENCIES.some((currency) => currency.code === code);
}

/** A stored value that isn't (or is no longer) supported reads as the default rather than breaking a page. */
export function normalizeCurrency(code: string | null | undefined): SupportedCurrency {
  return isSupportedCurrency(code) ? code : DEFAULT_CURRENCY;
}

export function currencyLabel(code: string): string {
  const match = SUPPORTED_CURRENCIES.find((currency) => currency.code === code);

  return match ? `${match.name} (${match.code})` : code;
}
