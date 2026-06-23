import { describe, expect, it } from "vitest";

import {
  getZonedDayWindow,
  getZonedWeekWindow,
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
