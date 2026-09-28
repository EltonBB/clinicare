// `ClientPayment.amountCents` is a Postgres `Int` (max ~2.147 billion), so this
// is the real ceiling regardless of which supported currency a workspace bills
// in — a fixed major-unit cap (e.g. "> 1,000,000") was USD/EUR-shaped and
// wrongly rejected ordinary amounts in a lower-value currency like HUF, where
// a real visit can legitimately run into the hundreds of thousands (Codex).
// Kept one order of magnitude below the actual overflow point so it still
// catches a genuine fat-finger extra digit.
export const MAX_PAYMENT_AMOUNT_MAJOR_UNITS = 20_000_000;

/** Parses a free-typed amount field into integer cents, or `null` if invalid. */
export function parseAmountToCents(value: string): number | null {
  const normalized = Number(value.replace(/[^0-9.-]/g, ""));

  if (!Number.isFinite(normalized) || normalized < 0 || normalized > MAX_PAYMENT_AMOUNT_MAJOR_UNITS) {
    return null;
  }

  return Math.round(normalized * 100);
}
