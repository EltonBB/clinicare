import type { Locale } from "./config";

/*
 * Formatting that reads the same on the server and in every browser. English
 * goes through Intl ("en-US" ships with every engine). Albanian is written out
 * here instead: browsers built with trimmed locale data (and some embedded
 * ones) don't carry "sq", so Intl would print "2026 M10 26" in one place and
 * "26 tetor 2026" in another, and the two renders of a page wouldn't match.
 */

export type PluralForms = { one: string; other: string };

/** Fills `{name}` placeholders; a placeholder without a value is left as is. */
export function fmt(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** A value stored in English (a status, a category) as the dictionary labels it; unknown values pass through. */
export function storedLabel(labels: Readonly<Record<string, string>>, value: string) {
  return labels[value] ?? value;
}

/** Picks the plural form for `count` and fills `{count}` plus any other values. */
export function plural(
  forms: PluralForms,
  count: number,
  locale: Locale,
  values: Record<string, string | number> = {},
) {
  // English and Albanian share the rule: exactly 1 is singular.
  return fmt(count === 1 ? forms.one : forms.other, {
    count: numberFormatter(locale).format(count),
    ...values,
  });
}

type NumberFormatterLike = Pick<Intl.NumberFormat, "format" | "resolvedOptions">;

/** Like `new Intl.NumberFormat(locale, options)`: "1,234.50" / "€40.00" in English, "12 345,50" / "40,00 €" in Albanian. */
export function numberFormatter(locale: Locale, options: Intl.NumberFormatOptions = {}): NumberFormatterLike {
  const english = new Intl.NumberFormat("en-US", options);
  if (locale === "en") return english;
  return {
    format(value: number | bigint) {
      let digits = "";
      let fraction = "";
      let sign = "";
      let currency = "";
      let percent = "";
      for (const part of english.formatToParts(value)) {
        if (part.type === "integer") digits += part.value;
        else if (part.type === "fraction") fraction = part.value;
        else if (part.type === "minusSign") sign = "-";
        else if (part.type === "currency") currency = part.value;
        else if (part.type === "percentSign") percent = "%";
      }
      // Albanian groups thousands with a (non-breaking) space and leaves four-digit numbers whole ("1234", "12 345").
      const grouped = digits.length >= 5 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") : digits;
      const number = `${sign}${grouped}${fraction ? `,${fraction}` : ""}${percent}`;
      return currency ? `${number}\u00a0${currency}` : number;
    },
    resolvedOptions: () => english.resolvedOptions(),
  } as NumberFormatterLike;
}

/** An amount of money the way the language writes it ("€40.00", "40,00 €"). */
export function money(locale: Locale, amount: number, currency = "EUR") {
  return numberFormatter(locale, { style: "currency", currency }).format(amount);
}

const SQ_MONTHS = ["janar", "shkurt", "mars", "prill", "maj", "qershor", "korrik", "gusht", "shtator", "tetor", "nëntor", "dhjetor"];
const SQ_MONTHS_SHORT = ["jan", "shk", "mar", "pri", "maj", "qer", "korr", "gush", "sht", "tet", "nën", "dhj"];
// Sunday first, like Date#getDay.
const SQ_WEEKDAYS = ["e diel", "e hënë", "e martë", "e mërkurë", "e enjte", "e premte", "e shtunë"];
const SQ_WEEKDAYS_SHORT = ["die", "hën", "mar", "mër", "enj", "pre", "sht"];
const EN_WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DateFormatterLike = { format(date: Date): string; formatRange(from: Date, to: Date): string };

/**
 * Like `new Intl.DateTimeFormat(locale, options)` for the options the app uses
 * (weekday, day, month, year, hour and minute, in a time zone). Albanian:
 * "e shtunë, 31 tetor 2026", "31 tet", "tetor 2026", "9:30", "26 tet – 1 nën 2026".
 */
export function dateFormatter(locale: Locale, options: Intl.DateTimeFormatOptions): DateFormatterLike {
  if (locale === "en") {
    const english = new Intl.DateTimeFormat("en-US", options);
    return { format: (date) => english.format(date), formatRange: (from, to) => english.formatRange(from, to) };
  }

  const reader = new Intl.DateTimeFormat("en-US", {
    timeZone: options.timeZone,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const read = (date: Date) => {
    const parts = Object.fromEntries(reader.formatToParts(date).map((part) => [part.type, part.value]));
    return {
      weekday: EN_WEEKDAYS_SHORT.indexOf(parts.weekday),
      day: Number(parts.day),
      month: Number(parts.month),
      year: parts.year,
      hour: parts.hour,
      minute: parts.minute,
    };
  };
  type Parts = ReturnType<typeof read>;
  const numericMonth = options.month === "numeric" || options.month === "2-digit";
  const monthName = (month: number) =>
    options.month === "long"
      ? SQ_MONTHS[month - 1]
      : options.month === "short"
        ? SQ_MONTHS_SHORT[month - 1]
        : String(month).padStart(2, "0");
  const datePart = (value: Parts) => {
    let text =
      options.day && options.month
        ? numericMonth
          ? `${String(value.day).padStart(2, "0")}.${monthName(value.month)}`
          : `${value.day} ${monthName(value.month)}`
        : options.month
          ? monthName(value.month)
          : options.day
            ? String(value.day)
            : "";
    if (options.year) text = text ? `${text}${numericMonth ? "." : " "}${value.year}` : value.year;
    return text;
  };
  const format = (date: Date) => {
    const value = read(date);
    const weekday = options.weekday ? (options.weekday === "long" ? SQ_WEEKDAYS : SQ_WEEKDAYS_SHORT)[value.weekday] : "";
    // Albanian writes "9:30"; a two-digit hour only when asked for.
    const hour = options.hour === "2-digit" ? value.hour : String(Number(value.hour));
    const time = options.hour !== undefined || options.minute !== undefined ? `${hour}:${value.minute}` : "";
    return [[weekday, datePart(value)].filter(Boolean).join(", "), time].filter(Boolean).join(", ");
  };

  return {
    format,
    formatRange(from, to) {
      const a = read(from);
      const b = read(to);
      if (a.year === b.year && a.month === b.month && a.day === b.day) return format(from);
      if (!options.weekday && !numericMonth && options.day && options.month && a.year === b.year) {
        const year = options.year ? ` ${a.year}` : "";
        return a.month === b.month
          ? `${a.day} – ${b.day} ${monthName(b.month)}${year}`
          : `${a.day} ${monthName(a.month)} – ${b.day} ${monthName(b.month)}${year}`;
      }
      return `${format(from)} – ${format(to)}`;
    },
  };
}

/** A date in the language's own style, e.g. `{ weekday: "long", month: "long", day: "numeric" }`. */
export function dateText(locale: Locale, date: Date, options: Intl.DateTimeFormatOptions) {
  return dateFormatter(locale, options).format(date);
}

/** Two dates as one range ("Oct 26 – Nov 1, 2026", "26 tet – 1 nën 2026"). */
export function dateRangeText(locale: Locale, from: Date, to: Date, options: Intl.DateTimeFormatOptions) {
  // Node's and the browser's ICU put different spaces around the dash (thin vs
  // plain), so the same label rendered twice failed hydration on every
  // Calendar load. Plain spaces read the same and match on both sides.
  return dateFormatter(locale, options).formatRange(from, to).replace(/[   ]/g, " ");
}
