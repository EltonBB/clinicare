import { formatZonedDateKey, formatZonedShortDate, formatZonedTime24 } from "@/lib/time-zone";

/**
 * Small pure time-label helpers for the mobile inbox/alerts view models. Kept
 * pure (take `now`) so they unit-test without mocks, like the rest of the suite.
 */

/** "now" | "2m ago" | "3h ago" | "2d ago" | short date for anything older. */
export function relativeLabel(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatZonedShortDate(date);
}

/** "Today" | "Yesterday" | short date (clinic zone), for message day separators. */
export function dayLabel(date: Date, now: Date = new Date()): string {
  const dayKey = formatZonedDateKey(date);
  if (dayKey === formatZonedDateKey(now)) return "Today";
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey === formatZonedDateKey(yesterday)) return "Yesterday";
  return formatZonedShortDate(date);
}

/** Short "h:mm"-style clock label for a message timestamp. */
export function clockLabel(date: Date): string {
  return formatZonedTime24(date);
}
