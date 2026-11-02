import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { messages } from "@/i18n/messages";
import { translateServerText } from "@/i18n/server-text";
import { formatZonedDateKey, formatZonedShortDate, formatZonedTime24 } from "@/lib/time-zone";

/**
 * Small pure time-label helpers for the mobile inbox/alerts view models. Kept
 * pure (take `now`) so they unit-test without mocks, like the rest of the suite.
 */

/** "now" | "2m ago" | "3h ago" | "2d ago" | short date for anything older. */
export function relativeLabel(date: Date, now: Date = new Date(), locale: Locale = "en"): string {
  const t = messages[locale].mobile;
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t.now;
  if (mins < 60) return fmt(t.minutesAgo, { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return fmt(t.hoursAgo, { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return fmt(t.daysAgo, { count: days });
  return formatZonedShortDate(date, undefined, locale);
}

/** Whether `date` falls on today's clinic-local day. */
export function isZonedToday(date: Date, now: Date = new Date()): boolean {
  return formatZonedDateKey(date) === formatZonedDateKey(now);
}

/** "Today" | "Yesterday" | short date (clinic zone), for message day separators. */
export function dayLabel(date: Date, now: Date = new Date(), locale: Locale = "en"): string {
  const t = messages[locale].mobile;
  if (isZonedToday(date, now)) return t.today;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (formatZonedDateKey(date) === formatZonedDateKey(yesterday)) return t.yesterday;
  return formatZonedShortDate(date, undefined, locale);
}

/**
 * A system notice stored in English, in the reader's language. Older notices
 * carry a 12-hour time ("1:00 PM"), which reads as 13:00 outside English.
 */
export function systemNoticeText(body: string, locale: Locale): string {
  const text = translateServerText(body, locale);
  if (locale === "en") return text;
  return text.replace(/\b(\d{1,2}):(\d{2}) ?([AP])M\b/g, (_, hours: string, minutes: string, half: string) => {
    const hour = (Number(hours) % 12) + (half === "P" ? 12 : 0);
    return `${String(hour).padStart(2, "0")}:${minutes}`;
  });
}

/** Short "h:mm"-style clock label for a message timestamp. */
export function clockLabel(date: Date): string {
  return formatZonedTime24(date);
}
