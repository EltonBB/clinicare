import { describe, expect, it } from "vitest";

import { dateFormatter, dateRangeText, dateText, fmt, money, numberFormatter, plural } from "./format";

describe("fmt", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(fmt("Hi {name}, {count} new", { name: "Maya", count: 3 })).toBe("Hi Maya, 3 new");
    expect(fmt("Hi {name}", {})).toBe("Hi {name}");
  });
});

describe("plural", () => {
  const forms = { one: "{count} termin", other: "{count} termine" };

  it("uses the one/other rule", () => {
    expect(plural(forms, 1, "sq")).toBe("1 termin");
    expect(plural(forms, 0, "sq")).toBe("0 termine");
    expect(plural(forms, 5, "sq")).toBe("5 termine");
  });

  it("formats the count for the language", () => {
    expect(plural({ one: "{count} visit", other: "{count} visits" }, 12000, "en")).toBe("12,000 visits");
    expect(plural({ one: "{count} vizitë", other: "{count} vizita" }, 12000, "sq")).toBe("12 000 vizita");
  });
});

// Node ships full ICU, so the hand-written Albanian is checked against it here;
// browsers without "sq" data then render exactly what the server did.
const icu = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("sq-XK", options).format(date).replace(/\u202f|\u00a0/g, " ");
const ZONE = "Europe/Budapest";
const SAMPLES = [new Date("2026-10-31T13:05:00Z"), new Date("2026-01-04T08:30:00Z"), new Date("2026-05-20T21:59:00Z")];

describe("Albanian dates match full ICU", () => {
  const patterns: Intl.DateTimeFormatOptions[] = [
    { weekday: "long", month: "long", day: "numeric", year: "numeric" },
    { weekday: "long", month: "long", day: "numeric" },
    { weekday: "short", month: "short", day: "numeric" },
    { month: "long", day: "numeric", year: "numeric" },
    { month: "short", day: "numeric" },
    { month: "long", year: "numeric" },
    { month: "short" },
    { weekday: "short" },
    { weekday: "long" },
    { hour: "numeric", minute: "2-digit" },
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  ];

  it.each(patterns)("%o", (options) => {
    for (const date of SAMPLES) {
      expect(dateText("sq", date, { ...options, timeZone: ZONE })).toBe(icu(date, { ...options, timeZone: ZONE }));
    }
  });

  it("writes ranges the way ICU does", () => {
    const options = { month: "short", day: "numeric", year: "numeric" } as const;
    const range = (from: Date, to: Date) =>
      new Intl.DateTimeFormat("sq-XK", options).formatRange(from, to).replace(/\u2009/g, " ");
    for (const [from, to] of [
      [new Date(2026, 9, 26), new Date(2026, 10, 1)],
      [new Date(2026, 10, 2), new Date(2026, 10, 8)],
    ]) {
      expect(dateRangeText("sq", from, to, options)).toBe(range(from, to));
    }
  });

  it("leaves English to Intl", () => {
    expect(dateFormatter("en", { month: "short", day: "numeric", timeZone: ZONE }).format(SAMPLES[0])).toBe("Oct 31");
  });
});

describe("Albanian numbers", () => {
  it("match full ICU for money and plain numbers", () => {
    const icuNumber = (value: number, options: Intl.NumberFormatOptions = {}) =>
      new Intl.NumberFormat("sq-XK", options).format(value).replace(/\u00a0|\u202f/g, " ");
    for (const value of [0, 7, 40, 1234.5, 12345.67, 1234567]) {
      expect(money("sq", value).replace(/\u00a0/g, " ")).toBe(icuNumber(value, { style: "currency", currency: "EUR" }));
      expect(numberFormatter("sq").format(value).replace(/ /g, " ")).toBe(icuNumber(value));
    }
    expect(money("sq", -40).replace(/\u00a0/g, " ")).toBe(icuNumber(-40, { style: "currency", currency: "EUR" }));
  });
});
