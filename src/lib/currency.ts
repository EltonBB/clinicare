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

/**
 * Before a clinic could pick a currency, every amount was shown in US dollars.
 * `Business.currency` arrived with prisma/clinic-currency-migration.sql (applied
 * to the shared database on 2026-09-27), which gave every existing workspace the
 * euro default. A payment recorded before that was entered under a "$" label no
 * workspace ever chose, so it must not stop its workspace correcting the
 * currency: counted, it left the owner of a workspace that really did bill in
 * dollars unable to undo the migration's default (Codex #130). Only a payment
 * recorded from this instant on, under a currency the clinic could see and set,
 * locks the currency (see saveSettingsAction).
 */
export const CURRENCY_CHOOSABLE_FROM = new Date("2026-09-27T00:00:00.000Z");

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
