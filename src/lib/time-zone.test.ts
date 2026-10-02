import { describe, expect, it } from "vitest";

import {
  getZonedDayWindow,
  getZonedDayWindowFromDateKey,
  getZonedWeekWindow,
  isRealCalendarDate,
  isRealDateKey,
  parseZonedWallClock,
  zonedDateTimeToUtc,
} from "@/lib/time-zone";

describe("parseZonedWallClock", () => {
  it("interprets the wall-clock entry in the given zone (DST-aware)", () => {
    // 2026-03-15 is after US DST starts (Mar 8) → EDT (UTC-4).
    const result = parseZonedWallClock("2026-03-15", "09:30", "America/New_York");
    expect(result?.toISOString()).toBe("2026-03-15T13:30:00.000Z");
  });

  it("anchors a date-only field to app-zone midnight, not UTC (the BUG-05 fix)", () => {
    // June in New York is EDT (UTC-4); midnight local == 04:00 UTC, which still
    // displays as June 22 in NY. The old `new Date("...T00:00:00Z")` would have
    // stored midnight UTC == 20:00 on June 21 in NY (wrong calendar day).
    const result = parseZonedWallClock("2026-06-22", "00:00", "America/New_York");
    expect(result?.toISOString()).toBe("2026-06-22T04:00:00.000Z");
  });

  it("returns null on malformed input", () => {
    expect(parseZonedWallClock("not-a-date", "09:30", "UTC")).toBeNull();
    expect(parseZonedWallClock("2026-06-22", "9:30", "UTC")).toBeNull();
    expect(parseZonedWallClock("", "", "UTC")).toBeNull();
  });

  // Codex #130: a date with the right shape but no such day used to be rolled over
  // into a different real one (2026-02-31 became March 3) and saved as that.
  it.each([
    ["February 31st", "2026-02-31"],
    ["February 29th in a common year", "2026-02-29"],
    ["February 29th in a century year that is not a leap year", "1900-02-29"],
    ["April 31st", "2026-04-31"],
    ["month 13", "2026-13-01"],
    ["month 00", "2026-00-10"],
    ["day 00", "2026-05-00"],
    ["day 32", "2026-01-32"],
  ])("rejects an impossible date: %s", (_label, date) => {
    expect(parseZonedWallClock(date, "09:00", "UTC")).toBeNull();
    expect(parseZonedWallClock(date, "00:00", "Europe/Budapest")).toBeNull();
  });

  it.each([
    ["February 29th in a leap year", "2028-02-29", "2028-02-29T09:00:00.000Z"],
    ["February 29th in a 400-year leap year", "2000-02-29", "2000-02-29T09:00:00.000Z"],
    ["the last day of a 31-day month", "2026-12-31", "2026-12-31T09:00:00.000Z"],
    ["the last day of a 30-day month", "2026-04-30", "2026-04-30T09:00:00.000Z"],
  ])("still parses a real date: %s", (_label, date, expected) => {
    expect(parseZonedWallClock(date, "09:00", "UTC")?.toISOString()).toBe(expected);
  });

  it.each([
    ["hour 25", "25:00"],
    ["hour 24 with minutes", "24:30"],
    ["minute 60", "12:60"],
    ["minute 99", "09:99"],
  ])("rejects an impossible time of day: %s", (_label, time) => {
    expect(parseZonedWallClock("2026-06-22", time, "UTC")).toBeNull();
  });

  it("keeps reading 24:00 as midnight at the end of the day, and accepts the day's last minute", () => {
    expect(parseZonedWallClock("2026-06-22", "24:00", "UTC")?.toISOString()).toBe("2026-06-23T00:00:00.000Z");
    expect(parseZonedWallClock("2026-06-22", "23:59", "UTC")?.toISOString()).toBe("2026-06-22T23:59:00.000Z");
    expect(parseZonedWallClock("2026-06-22", "00:00", "UTC")?.toISOString()).toBe("2026-06-22T00:00:00.000Z");
  });

  it("still resolves a wall-clock time that falls in a daylight-saving gap to a real moment, as before", () => {
    // 02:30 on 2026-03-29 does not exist in Budapest (clocks jump 02:00 -> 03:00).
    expect(parseZonedWallClock("2026-03-29", "02:30", "Europe/Budapest")).not.toBeNull();
  });
});

describe("isRealCalendarDate / isRealDateKey", () => {
  it.each([
    [2028, 2, 29, true],
    [2026, 2, 29, false],
    [1900, 2, 29, false],
    [2000, 2, 29, true],
    [2026, 1, 31, true],
    [2026, 4, 31, false],
    [2026, 12, 31, true],
    [2026, 0, 10, false],
    [2026, 13, 1, false],
    [2026, 5, 0, false],
    [2026, 5, -1, false],
    [2026, 1.5, 1, false],
    [Number.NaN, 1, 1, false],
  ])("%i-%i-%i is a real date: %s", (year, month, day, expected) => {
    expect(isRealCalendarDate(year, month, day)).toBe(expected);
  });

  it("checks both the shape and the day for a YYYY-MM-DD key", () => {
    expect(isRealDateKey("2026-10-02")).toBe(true);
    expect(isRealDateKey(" 2026-10-02 ")).toBe(true);
    expect(isRealDateKey("2026-02-31")).toBe(false);
    expect(isRealDateKey("2026-2-3")).toBe(false);
    expect(isRealDateKey("")).toBe(false);
  });
});

describe("getZonedDayWindowFromDateKey", () => {
  it("returns the true UTC bounds of a real clinic-local day", () => {
    const window = getZonedDayWindowFromDateKey("2026-10-05", "Europe/Budapest");

    // Budapest is UTC+2 on 5 Oct 2026, so the day runs 22:00Z -> 21:59:59.999Z.
    expect(window?.start.toISOString()).toBe("2026-10-04T22:00:00.000Z");
    expect(window?.end.toISOString()).toBe("2026-10-05T21:59:59.999Z");
  });

  // Callers delete the rows inside this window: an impossible key must not be rolled
  // over into March 3 and wipe that day's rows instead.
  it.each(["2026-02-31", "2026-13-01", "2026-00-00", "not-a-date", ""])("returns null for %j", (key) => {
    expect(getZonedDayWindowFromDateKey(key, "Europe/Budapest")).toBeNull();
  });
});

describe("zonedDateTimeToUtc", () => {
  it("round-trips a UTC wall-clock with zero offset", () => {
    const utc = zonedDateTimeToUtc({ year: 2026, month: 6, day: 22, hour: 12, timeZone: "UTC" });
    expect(utc.toISOString()).toBe("2026-06-22T12:00:00.000Z");
  });
});

describe("getZonedDayWindow", () => {
  it("spans exactly one calendar day in the given zone", () => {
    const day = new Date("2026-06-22T15:00:00.000Z");
    const { start, end } = getZonedDayWindow(day, "UTC");
    expect(start.toISOString()).toBe("2026-06-22T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-22T23:59:59.999Z");
    expect(end.getTime() - start.getTime()).toBe(86_400_000 - 1);
  });
});

describe("getZonedWeekWindow", () => {
  it("starts the week on Monday", () => {
    // 2026-06-24 is a Wednesday → week starts Monday 2026-06-22.
    const { start, end } = getZonedWeekWindow(new Date("2026-06-24T10:00:00.000Z"), "UTC");
    expect(start.toISOString()).toBe("2026-06-22T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-28T23:59:59.999Z");
    expect(end.getTime() - start.getTime()).toBe(7 * 86_400_000 - 1);
  });
});
