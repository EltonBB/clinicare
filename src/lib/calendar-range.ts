// Pure date-range helpers for the calendar's month-at-a-time loading. Everything
// is calendar-date arithmetic on `YYYY-MM-DD` keys (done in UTC on the date
// parts), so it never depends on the server's or browser's time zone.

/** An inclusive span of calendar days, as `YYYY-MM-DD` keys. */
export type CalendarRange = { from: string; to: string };

const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

// Keeps a crafted month key from asking the database for centuries of rows.
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export function isValidMonthKey(monthKey: string) {
  const match = MONTH_KEY_PATTERN.exec(monthKey);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);

  return year >= MIN_YEAR && year <= MAX_YEAR;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * The Monday-to-Sunday grid a month view draws: from the Monday on or before the
 * 1st to the Sunday on or after the last day. Loading this range (not just the
 * month itself) means the month view's leading/trailing days from the
 * neighbouring months show their appointments too, and any week of the month is
 * complete. Returns null for an invalid key.
 */
export function monthGridRange(monthKey: string): CalendarRange | null {
  if (!isValidMonthKey(monthKey)) {
    return null;
  }

  const [year, month] = monthKey.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastOfMonth = new Date(Date.UTC(year, month, 0));
  // getUTCDay: Sunday = 0 … Saturday = 6 → days back to Monday / forward to Sunday.
  const daysBackToMonday = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysForwardToSunday = (7 - lastOfMonth.getUTCDay()) % 7;
  const from = new Date(Date.UTC(year, month - 1, 1 - daysBackToMonday));
  const to = new Date(Date.UTC(year, month, daysForwardToSunday));

  return { from: toDateKey(from), to: toDateKey(to) };
}

export function isCovered(dayKey: string, ranges: readonly CalendarRange[]) {
  // `YYYY-MM-DD` keys sort lexically in date order.
  return ranges.some((range) => dayKey >= range.from && dayKey <= range.to);
}

/**
 * The months that still need loading to show `dayKeys`, in date order.
 *
 * `anchorMonth` is the month being viewed. Its Monday–Sunday grid contains every
 * visible day — a month view is that grid, and a week or a day belongs to a week
 * the grid spans — so when anything is missing, loading that one month covers it
 * all. Attributing each missing day to its own calendar month instead would fetch
 * a redundant neighbour: the leading days of a month view (say, late July on an
 * August grid) would trigger a July load the August grid already includes. A day
 * that somehow falls outside the anchor's grid still gets its own month.
 */
export function monthsToLoad(
  dayKeys: readonly string[],
  ranges: readonly CalendarRange[],
  anchorMonth: string
) {
  const anchorGrid = monthGridRange(anchorMonth);
  const months = new Set<string>();

  for (const dayKey of dayKeys) {
    if (isCovered(dayKey, ranges)) {
      continue;
    }

    const insideAnchorGrid = anchorGrid && dayKey >= anchorGrid.from && dayKey <= anchorGrid.to;

    months.add(insideAnchorGrid ? anchorMonth : dayKey.slice(0, 7));
  }

  return [...months].sort();
}
