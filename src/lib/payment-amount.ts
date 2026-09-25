export function parseAmountToCents(value: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const whole = Number(match[1]);
  if (!Number.isSafeInteger(whole) || whole > 1_000_000) {
    return null;
  }

  // Convert the two decimal digits directly, without rounding a floating amount.
  const cents = whole * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents <= 100_000_000 ? cents : null;
}
