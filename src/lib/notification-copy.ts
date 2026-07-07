import { dayLabel } from "@/lib/mobile/relative-time";
import { formatZonedTime, getZonedDateParts } from "@/lib/time-zone";

/**
 * Pure notification-copy helpers, kept out of (workspace)/actions.ts (a
 * Prisma-touching "use server" module — importing it in a test throws at
 * load time without DATABASE_URL set) so this stays unit-testable.
 */

// A check-in can sit unseen indefinitely (no expiry on seenByAdminAt), so the
// bell needs to say WHEN as well as what time — a bare "Checked in at 11:52
// PM" reads as "just now" even when it's from yesterday. Matches the
// Today/Yesterday/short-date convention already used for message timestamps
// elsewhere (lib/mobile/relative-time.ts's dayLabel, e.g. the admin Messages
// tab) — 12-hour formatZonedTime stays as-is, only the day qualifier is new.
// dayLabel's short-date fallback ("Jul 6") has no year, which is ambiguous
// for something that can genuinely sit unseen for over a year — append the
// year whenever the check-in isn't from the current (zoned) year.
export function checkinDetail(checkedInAt: Date, now: Date = new Date()): string {
  const time = formatZonedTime(checkedInAt);
  const day = dayLabel(checkedInAt, now);
  let when: string;
  if (day === "Today") {
    when = "";
  } else if (day === "Yesterday") {
    when = "yesterday ";
  } else {
    const sameYear = getZonedDateParts(checkedInAt).year === getZonedDateParts(now).year;
    when = sameYear ? `${day} ` : `${day}, ${getZonedDateParts(checkedInAt).year} `;
  }
  return `Checked in ${when}at ${time} — verify they're in.`;
}
