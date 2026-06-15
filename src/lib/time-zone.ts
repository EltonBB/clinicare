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

/**
 * Parse an operator's `YYYY-MM-DD` + `HH:mm` wall-clock entry as a time in the
 * app's zone and return the true UTC instant. Use this for any human-entered
 * date+time (appointments, shifts) instead of `new Date("...T...")`, which is
 * parsed in the server's local zone (UTC on Vercel) and silently shifts times.
 * Returns null on malformed input.
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

  const parsed = zonedDateTimeToUtc({
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    timeZone,
  });

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
