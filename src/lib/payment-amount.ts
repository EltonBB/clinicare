import { SUPPORTED_CURRENCIES } from "@/lib/currency";

// `ClientPayment.amountCents` is a Postgres `Int` (max ~2.147 billion), so this
// is the real ceiling regardless of which supported currency a workspace bills
// in — a fixed major-unit cap (e.g. "> 1,000,000") was USD/EUR-shaped and
// wrongly rejected ordinary amounts in a lower-value currency like HUF, where
// a real visit can legitimately run into the hundreds of thousands (Codex).
// Kept one order of magnitude below the actual overflow point so it still
// catches a genuine fat-finger extra digit.
export const MAX_PAYMENT_AMOUNT_MAJOR_UNITS = 20_000_000;

const CODES = SUPPORTED_CURRENCIES.map((currency) => currency.code).join("|");
// A supported currency code typed before or after the number ("85 EUR").
const CURRENCY_CODE = new RegExp(`^(${CODES})|(${CODES})$`, "gi");

// Thousands grouping the way the app itself displays money: "1,200" / "1,200.50".
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d*)?$/;
// A decimal comma, as typed in much of the Balkans/Europe: "12,50". A thousands
// group is always exactly three digits, so one or two digits after a comma can
// only be cents.
const DECIMAL_COMMA = /^\d+,\d{1,2}$/;
// What is left must be plain digits with at most one dot — no sign, no letters.
const PLAIN = /^(\d+\.?\d*|\.\d+)$/;
// Finer than a cent.
const SUB_CENT = /\.\d{3,}$/;

/**
 * Parses a free-typed amount field into integer cents, or `null` if it is not
 * an unambiguous amount.
 *
 * The format is validated, not scrubbed: only whitespace (including the
 * no-break spaces some locales group thousands with), currency symbols and a
 * supported currency code such as "EUR" at either end are ignored. Everything else
 * that is not a clean number is rejected instead of being quietly turned into
 * some other amount — "12,50" used to become 1250.00, a pasted Unicode minus
 * "−5" became +5, "abc" became 0.00 and "0.001" became a free payment
 * (CodeRabbit #131). A literal "0" is still a valid amount.
 */
export function parseAmountToCents(value: string): number | null {
  let text = value
    .replace(/[\s  ]/g, "")
    .replace(/\p{Sc}/gu, "")
    .replace(CURRENCY_CODE, "");

  if (GROUPED.test(text)) {
    text = text.replace(/,/g, "");
  } else if (DECIMAL_COMMA.test(text)) {
    text = text.replace(",", ".");
  }

  if (!PLAIN.test(text) || SUB_CENT.test(text)) {
    return null;
  }

  const amount = Number(text);

  if (!Number.isFinite(amount) || amount > MAX_PAYMENT_AMOUNT_MAJOR_UNITS) {
    return null;
  }

  return Math.round(amount * 100);
}
