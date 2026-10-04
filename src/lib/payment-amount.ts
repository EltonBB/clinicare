import { SUPPORTED_CURRENCIES } from "@/lib/currency";

// `ClientPayment.amountCents` is a Postgres `Int` (max ~2.147 billion), so this
// is the real ceiling regardless of which supported currency a workspace bills
// in — a fixed major-unit cap (e.g. "> 1,000,000") was USD/EUR-shaped and
// wrongly rejected ordinary amounts in a lower-value currency like HUF, where
// a real visit can legitimately run into the hundreds of thousands (Codex).
// Kept one order of magnitude below the actual overflow point so it still
// catches a genuine fat-finger extra digit.
export const MAX_PAYMENT_AMOUNT_MAJOR_UNITS = 20_000_000;

// The currency symbols people type for a supported currency. Any other symbol
// is refused rather than ignored: a "¥85" or "₹85" is not an amount in a
// currency this workspace can bill in.
const SYMBOL_CURRENCY: Record<string, string> = { "€": "EUR", "£": "GBP", $: "USD", "₺": "TRY" };

const MARKER = `\\p{Sc}|${SUPPORTED_CURRENCIES.map((currency) => currency.code).join("|")}`;
// At most one currency marker (a symbol or a supported code), and only at
// either end of the number, optionally spaced from it: "€85", "85 EUR". The
// "s" (dotAll) flag makes `.*?` match a literal newline too — without it, a
// pasted "1\n200" leaves WRAPPED unable to match anything at all, and
// `.exec()!` on the result throws instead of the parser returning `null`
// (CodeRabbit #131).
const WRAPPED = new RegExp(`^(?:(${MARKER})\\s*)?(.*?)(?:\\s*(${MARKER}))?$`, "ius");

// Only the space characters a thousands grouping actually uses — a bare `\s`
// also matches a tab, newline or vertical tab, which would otherwise let
// "1\t200" collapse into 1200 the same way "12 50" used to (CodeRabbit #131).
const SPACE_CHAR = " |\\u00a0|\\u202f";
const SPACE_CHARS = new RegExp(SPACE_CHAR, "g");

// Thousands grouping the way the app itself displays money: "1,200" / "1,200.50".
const COMMA_GROUPED = /^\d{1,3}(,\d{3})+(\.\d*)?$/;
// The same grouped with spaces (regular or no-break), as in much of Europe:
// "1 200" / "1 200,50". Each group is exactly three digits — "12 50" is not one.
const SPACE_GROUPED = new RegExp(`^\\d{1,3}((${SPACE_CHAR})\\d{3})+([.,]\\d*)?$`);
// A decimal comma, as typed in much of the Balkans/Europe: "12,50". A thousands
// group is always exactly three digits, so one or two digits after a comma can
// only be cents.
const DECIMAL_COMMA = /^\d+,\d{1,2}$/;
// What is left must be plain digits with at most one dot — no sign, no letters.
const PLAIN = /^(\d+\.?\d*|\.\d+)$/;
// Finer than a cent.
const SUB_CENT = /\.\d{3,}$/;

function normalizeSeparators(text: string): string {
  if (COMMA_GROUPED.test(text)) {
    return text.replace(/,/g, "");
  }

  if (SPACE_GROUPED.test(text)) {
    return text.replace(SPACE_CHARS, "").replace(",", ".");
  }

  return DECIMAL_COMMA.test(text) ? text.replace(",", ".") : text;
}

/**
 * Parses a free-typed amount field into integer cents, or `null` if it is not
 * an unambiguous amount.
 *
 * The format is validated, not scrubbed. Whitespace around the number and one
 * currency marker (a symbol such as "€", or a supported code such as "EUR") at
 * either end are allowed; everything else that is not a clean number is
 * rejected instead of being quietly turned into some other amount — "12,50"
 * used to become 1250.00, a pasted Unicode minus "−5" became +5, "abc" became
 * 0.00, "0.001" became a free payment, and "12 50" or "12€50" became 1250.00
 * (CodeRabbit #131). A literal "0" is still a valid amount.
 *
 * When `expectedCurrency` (the workspace's currency) is given, a marker for any
 * other currency is rejected too — "85 USD" typed into a euro workspace must
 * not be stored as 85 euros. Two markers ("EUR 85 USD") are always rejected.
 */
export function parseAmountToCents(value: string, expectedCurrency?: string): number | null {
  // WRAPPED always matches — prefix, body and suffix are all optional — so
  // this only ever splits the string into its (possibly empty) three parts.
  const [, prefix, body, suffix] = WRAPPED.exec(value.trim())!;

  if (prefix && suffix) {
    return null;
  }

  const marker = prefix ?? suffix;

  if (marker) {
    const code = SYMBOL_CURRENCY[marker] ?? (/^\p{Sc}$/u.test(marker) ? undefined : marker.toUpperCase());

    if (!code || (expectedCurrency && code !== expectedCurrency)) {
      return null;
    }
  }

  const text = normalizeSeparators(body);

  if (!PLAIN.test(text) || SUB_CENT.test(text)) {
    return null;
  }

  const amount = Number(text);

  if (!Number.isFinite(amount) || amount > MAX_PAYMENT_AMOUNT_MAJOR_UNITS) {
    return null;
  }

  return Math.round(amount * 100);
}
