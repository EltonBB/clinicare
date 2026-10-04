const DEFAULT_APP_TIME_ZONE = "Europe/Budapest";

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getDateTimeFormat(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

export function getZonedDateParts(date: Date, timeZone = getAppTimeZone()): ZonedDateParts {
  const parts = getDateTimeFormat(timeZone).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedDateParts(date, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return localAsUtc - date.getTime();
}

export function getAppTimeZone() {
  return (
    process.env.APP_TIME_ZONE?.trim() ||
    process.env.NEXT_PUBLIC_APP_TIME_ZONE?.trim() ||
    DEFAULT_APP_TIME_ZONE
  );
}

export function zonedDateTimeToUtc(args: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
  timeZone?: string;
}) {
  const {
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
    timeZone = getAppTimeZone(),
  } = args;
  const localTimestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let utcTimestamp = localTimestamp;

  for (let index = 0; index < 3; index += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utcTimestamp), timeZone);
    const nextTimestamp = localTimestamp - offset;

    if (Math.abs(nextTimestamp - utcTimestamp) < 1) {
      break;
    }

    utcTimestamp = nextTimestamp;
  }

  return new Date(utcTimestamp);
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Whether year-month-day is a real calendar date: 2026-02-31 and 2026-13-01 are
 * not. `Date.UTC` and `zonedDateTimeToUtc` quietly roll such a date over into a
 * different, real one (2026-02-31 becomes March 3), so a value that is only
 * checked for its `YYYY-MM-DD` shape would be saved as a different day than the
 * one that was typed (Codex #130). Pure calendar arithmetic, no zone involved.
 */
export function isRealCalendarDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = month === 2 && leapYear ? 29 : DAYS_IN_MONTH[month - 1];

  return day <= daysInMonth;
}

/** A `YYYY-MM-DD` string that names a real calendar date (see isRealCalendarDate). */
export function isRealDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  return match !== null && isRealCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * Parse an operator's `YYYY-MM-DD` + `HH:mm` wall-clock entry as a time in the
 * app's zone and return the true UTC instant. Use this for any human-entered
 * date+time (appointments, shifts) instead of `new Date("...T...")`, which is
 * parsed in the server's local zone (UTC on Vercel) and silently shifts times.
 * Returns null on malformed input, including a date or time that has the right
 * shape but cannot exist (2026-02-31, 25:00, 12:60) - those used to be rolled
 * over into a different real moment. `24:00` is still read as midnight at the end
 * of the day, as it always was.
 */
export function parseZonedWallClock(
  date: string,
  time: string,
  timeZone = getAppTimeZone()
) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time.trim());

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  const endOfDay = hour === 24 && minute === 0;

  if (!isRealCalendarDate(year, month, day) || minute > 59 || (hour > 23 && !endOfDay)) {
    return null;
  }

  const parsed = zonedDateTimeToUtc({ year, month, day, hour, minute, timeZone });

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getZonedDayWindow(date = new Date(), timeZone = getAppTimeZone()) {
  const parts = getZonedDateParts(date, timeZone);
  return getZonedDayWindowFromParts(parts.year, parts.month, parts.day, timeZone);
}

export function getZonedDayWindowFromParts(
  year: number,
  month: number,
  day: number,
  timeZone = getAppTimeZone()
) {
  const start = zonedDateTimeToUtc({
    year,
    month,
    day,
    timeZone,
  });
  const nextDayStart = zonedDateTimeToUtc({
    year,
    month,
    day: day + 1,
    timeZone,
  });

  return {
    start,
    end: new Date(nextDayStart.getTime() - 1),
    parts: getZonedDateParts(start, timeZone),
  };
}

/**
 * The true UTC bounds of a `YYYY-MM-DD` clinic-local date key, or null for
 * anything that is not a real calendar date. Callers that delete or replace rows
 * inside the window rely on this: an impossible key (2026-02-31) must not be
 * rolled over into March 3 and wipe that day's rows instead (Codex #130).
 */
export function getZonedDayWindowFromDateKey(dateKey: string, timeZone = getAppTimeZone()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return isRealCalendarDate(year, month, day) ? getZonedDayWindowFromParts(year, month, day, timeZone) : null;
}

export function addZonedDays(
  parts: Pick<ZonedDateParts, "year" | "month" | "day">,
  amount: number
) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function getZonedDayWindowByOffset(
  date = new Date(),
  dayOffset = 0,
  timeZone = getAppTimeZone()
) {
  const parts = getZonedDateParts(date, timeZone);
  const shifted = addZonedDays(parts, dayOffset);

  return getZonedDayWindowFromParts(
    shifted.year,
    shifted.month,
    shifted.day,
    timeZone
  );
}

export function getZonedWeekWindow(date = new Date(), timeZone = getAppTimeZone()) {
  const parts = getZonedDateParts(date, timeZone);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  const startParts = addZonedDays(parts, -daysSinceMonday);
  const endParts = addZonedDays(startParts, 7);
  const start = zonedDateTimeToUtc({ ...startParts, timeZone });
  const nextWeekStart = zonedDateTimeToUtc({ ...endParts, timeZone });

  return {
    start,
    end: new Date(nextWeekStart.getTime() - 1),
    parts: startParts,
  };
}

export function getZonedMonthWindow(date = new Date(), timeZone = getAppTimeZone()) {
  const parts = getZonedDateParts(date, timeZone);
  const start = zonedDateTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: 1,
    timeZone,
  });
  const nextMonthStart = zonedDateTimeToUtc({
    year: parts.month === 12 ? parts.year + 1 : parts.year,
    month: parts.month === 12 ? 1 : parts.month + 1,
    day: 1,
    timeZone,
  });

  return {
    start,
    end: new Date(nextMonthStart.getTime() - 1),
    parts: {
      year: parts.year,
      month: parts.month,
      day: 1,
    },
  };
}

export function getZonedMonthStart(date = new Date(), timeZone = getAppTimeZone()) {
  const parts = getZonedDateParts(date, timeZone);

  return zonedDateTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: 1,
    timeZone,
  });
}

export function formatZonedDateKey(date = new Date(), timeZone = getAppTimeZone()) {
  const parts = getZonedDateParts(date, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");

  return `${parts.year}-${month}-${day}`;
}

export function formatZonedLongDate(date = new Date(), timeZone = getAppTimeZone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatZonedDayName(date: Date, timeZone = getAppTimeZone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
}

export function formatZonedMonthName(date: Date, timeZone = getAppTimeZone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
  }).format(date);
}

export function formatZonedShortDate(date: Date, timeZone = getAppTimeZone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatZonedWeekdayShortDate(date: Date, timeZone = getAppTimeZone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatZonedFullDate(date = new Date(), timeZone = getAppTimeZone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Whole-calendar-day difference (later − earlier) in the app time zone.
 * Snaps both instants to their zoned day start so DST-length days stay exact.
 */
export function zonedCalendarDaysBetween(
  earlier: Date,
  later: Date,
  timeZone = getAppTimeZone()
) {
  const earlierStart = getZonedDayWindow(earlier, timeZone).start.getTime();
  const laterStart = getZonedDayWindow(later, timeZone).start.getTime();

  return Math.round((laterStart - earlierStart) / 86_400_000);
}

export function formatZonedMonthYear(date: Date, timeZone = getAppTimeZone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatZonedTime(date: Date, timeZone = getAppTimeZone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** 24-hour `HH:mm` in the app zone — for `<input type="time">` and grid keys. */
export function formatZonedTime24(date: Date, timeZone = getAppTimeZone()) {
  const parts = getZonedDateParts(date, timeZone);
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");

  return `${hour}:${minute}`;
}

/**
 * How many minutes the clinic's wall clock advances from `start` to `end`: whole
 * calendar days plus the difference in time of day, both read in the app zone.
 * This is the length the booking form needs - it adds the length to the wall-clock
 * start to get the end time - and it is NOT the elapsed time: across a daylight-
 * saving change the two differ by the clock shift. A 01:30-03:30 slot on the
 * spring-forward night (Europe/Budapest, 2026-03-29) lasts 60 minutes but runs 120
 * on the wall clock; pre-filling the elapsed 60 makes the form derive 02:30, a
 * time that does not exist that night, which resolves back to the start and is
 * refused (Codex #130).
 */
export function getZonedWallClockMinutesBetween(start: Date, end: Date, timeZone = getAppTimeZone()) {
  const from = getZonedDateParts(start, timeZone);
  const to = getZonedDateParts(end, timeZone);
  const days = Math.round(
    (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86_400_000
  );

  return days * 1440 + (to.hour * 60 + to.minute) - (from.hour * 60 + from.minute);
}

export function formatZonedShortDateTime(date: Date, timeZone = getAppTimeZone()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function getZonedWeekday(date = new Date(), timeZone = getAppTimeZone()) {
  const parts = getZonedDateParts(date, timeZone);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  return utcDate.getUTCDay();
}
