import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { messages, type Messages } from "@/i18n/messages";
import { formatZonedDateKey, formatZonedShortDate, formatZonedTime, getZonedDateParts } from "@/lib/time-zone";

/**
 * Pure notification-copy helpers, kept out of (workspace)/actions.ts (a
 * Prisma-touching "use server" module — importing it in a test throws at
 * load time without DATABASE_URL set) so this stays unit-testable.
 */

// A check-in can sit unseen indefinitely (no expiry on seenByAdminAt), so the
// bell needs to say WHEN as well as what time — a bare "Checked in at 11:52
// PM" reads as "just now" even when it's from yesterday. The short-date
// fallback ("Jul 6") has no year, which is ambiguous for something that can
// genuinely sit unseen for over a year — append the year whenever the
// check-in isn't from the current (zoned) year.
export function checkinDetail(
  checkedInAt: Date,
  now: Date = new Date(),
  locale: Locale = "en",
  copy: Messages["shell"]["notifications"] = messages[locale].shell.notifications,
): string {
  const time = formatZonedTime(checkedInAt, undefined, locale);
  const dayKey = formatZonedDateKey(checkedInAt);
  if (dayKey === formatZonedDateKey(now)) return fmt(copy.checkinToday, { time });
  if (dayKey === formatZonedDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) {
    return fmt(copy.checkinYesterday, { time });
  }
  const sameYear = getZonedDateParts(checkedInAt).year === getZonedDateParts(now).year;
  const short = formatZonedShortDate(checkedInAt, undefined, locale);
  const day = sameYear ? short : `${short}, ${getZonedDateParts(checkedInAt).year}`;
  return fmt(copy.checkinOn, { day, time });
}
