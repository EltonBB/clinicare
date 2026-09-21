import { describe, expect, it } from "vitest";

import { buildCalendarViewFromRecords, businessHoursForDate } from "@/lib/calendar";
import {
  addZonedDays,
  formatZonedDateKey,
  formatZonedTime24,
  getAppTimeZone,
  getZonedDateParts,
  zonedDateTimeToUtc,
} from "@/lib/time-zone";

const BUSINESS_HOURS = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  isOpen: weekday >= 1 && weekday <= 5,
  startTime: "09:00",
  endTime: "17:00",
}));

function scheduleBlock(overrides: { startsAt: Date; endsAt: Date; title?: string }) {
  return {
    id: "block_1",
    businessId: "biz_1",
    title: overrides.title ?? "Closure",
    startsAt: overrides.startsAt,
    endsAt: overrides.endsAt,
    reason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

// Expected date/time strings are derived from the same zoned formatters the
// implementation uses (not hardcoded literals), so this suite doesn't depend
// on which APP_TIME_ZONE happens to be configured when it runs.
describe("buildCalendarViewFromRecords — ScheduleBlock day expansion", () => {
  it("keeps a same-day block as a single entry with its real start/end times", () => {
    const startsAt = new Date("2026-06-23T09:00:00.000Z");
    const endsAt = new Date("2026-06-23T11:00:00.000Z");
    const view = buildCalendarViewFromRecords({
      appointments: [],
      scheduleBlocks: [scheduleBlock({ startsAt, endsAt })],
      staffMembers: [],
      businessHours: BUSINESS_HOURS,
      ownerName: "Owner",
    });

    expect(view.scheduleBlocks).toEqual([
      {
        id: "block_1",
        title: "Closure",
        date: formatZonedDateKey(startsAt),
        startTime: formatZonedTime24(startsAt),
        endTime: formatZonedTime24(endsAt),
        notes: "",
      },
    ]);
  });

  it("splits a multi-day block into one entry per day, clamped to each day's portion", () => {
    // A holiday closure spanning 3 calendar days — before this fix, the whole
    // block collapsed onto its start day only, so the second day and the
    // morning of the third day silently showed as full, unblocked capacity.
    const startsAt = new Date("2026-12-24T20:00:00.000Z");
    const endsAt = new Date("2026-12-26T08:00:00.000Z");
    const view = buildCalendarViewFromRecords({
      appointments: [],
      scheduleBlocks: [scheduleBlock({ startsAt, endsAt, title: "Holiday closure" })],
      staffMembers: [],
      businessHours: BUSINESS_HOURS,
      ownerName: "Owner",
    });

    expect(view.scheduleBlocks).toHaveLength(3);
    const [first, middle, last] = view.scheduleBlocks;

    expect(first.title).toBe("Holiday closure");
    expect(first.date).toBe(formatZonedDateKey(startsAt));
    expect(first.startTime).toBe(formatZonedTime24(startsAt));
    expect(first.endTime).toBe("23:59");

    expect(middle.startTime).toBe("00:00");
    expect(middle.endTime).toBe("23:59");

    expect(last.date).toBe(formatZonedDateKey(endsAt));
    expect(last.startTime).toBe("00:00");
    expect(last.endTime).toBe(formatZonedTime24(endsAt));

    // Three distinct, chronologically ordered calendar days ("yyyy-MM-dd"
    // strings sort chronologically), regardless of which day they land on.
    expect(first.date < middle.date).toBe(true);
    expect(middle.date < last.date).toBe(true);
  });

  it("omits the exclusive terminal day when a multi-day block ends exactly at midnight", () => {
    // The normal end-exclusive way to represent "blocked through the end of
    // the second day" — before this fix, the loop still emitted a third,
    // zero-duration {date: thirdDay, startTime: "00:00", endTime: "00:00"}
    // entry for the instant itself, which BlockCard's minimum-height
    // rendering and the month view/day rail both still showed as a blocked
    // third day, even though nothing on it is actually closed.
    const startsAt = new Date("2026-12-24T20:00:00.000Z");
    const timeZone = getAppTimeZone();
    const startDayParts = getZonedDateParts(startsAt, timeZone);
    const secondDayParts = addZonedDays(startDayParts, 1);
    const endsAt = zonedDateTimeToUtc({
      ...addZonedDays(startDayParts, 2),
      hour: 0,
      minute: 0,
      timeZone,
    });
    const view = buildCalendarViewFromRecords({
      appointments: [],
      scheduleBlocks: [scheduleBlock({ startsAt, endsAt, title: "Holiday closure" })],
      staffMembers: [],
      businessHours: BUSINESS_HOURS,
      ownerName: "Owner",
    });

    expect(view.scheduleBlocks).toHaveLength(2);
    const [first, last] = view.scheduleBlocks;

    expect(first.date).toBe(formatZonedDateKey(startsAt));
    expect(first.startTime).toBe(formatZonedTime24(startsAt));
    expect(first.endTime).toBe("23:59");

    // The real last day of the closure, not the exclusive endpoint day —
    // rendered through end of day, not the literal (misleading) "00:00" the
    // block's raw endsAt would otherwise produce.
    expect(last.date).toBe(
      `${secondDayParts.year}-${String(secondDayParts.month).padStart(2, "0")}-${String(secondDayParts.day).padStart(2, "0")}`
    );
    expect(last.startTime).toBe("00:00");
    expect(last.endTime).toBe("23:59");
  });

  it("clamps expansion to the fetched calendar range instead of the block's full span", () => {
    // A closure starting long before the visible window and ending long
    // after it — before this fix, expansion walked every day from the
    // block's actual start, most of them off-screen and unrenderable.
    const startsAt = new Date("2026-01-01T09:00:00.000Z");
    const endsAt = new Date("2026-01-20T17:00:00.000Z");
    const rangeStart = new Date("2026-01-05T12:00:00.000Z");
    const rangeEnd = new Date("2026-01-07T12:00:00.000Z");
    const view = buildCalendarViewFromRecords({
      appointments: [],
      scheduleBlocks: [scheduleBlock({ startsAt, endsAt, title: "Long closure" })],
      staffMembers: [],
      businessHours: BUSINESS_HOURS,
      ownerName: "Owner",
      rangeStart,
      rangeEnd,
    });

    expect(view.scheduleBlocks).toHaveLength(3);
    for (const entry of view.scheduleBlocks) {
      // Neither range boundary is the block's true first/last day, so every
      // clamped entry is a full continuation day, never the block's real
      // (long-past/long-future) start/end time.
      expect(entry.startTime).toBe("00:00");
      expect(entry.endTime).toBe("23:59");
    }
    expect(view.scheduleBlocks[0].date).toBe(formatZonedDateKey(rangeStart));
    expect(view.scheduleBlocks[2].date).toBe(formatZonedDateKey(rangeEnd));
  });
});

describe("businessHoursForDate", () => {
  // Monday-first weekdays (0 = Monday): open Monday-Friday, closed the weekend.
  const hours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    enabled: weekday <= 4,
    start: "09:00",
    end: "17:00",
  }));

  it("finds the row for the date's weekday", () => {
    // 2026-09-21 is a Monday, 2026-09-26 a Saturday, 2026-09-27 a Sunday.
    expect(businessHoursForDate("2026-09-21", hours)).toMatchObject({ weekday: 0, enabled: true });
    expect(businessHoursForDate("2026-09-25", hours)).toMatchObject({ weekday: 4, enabled: true });
    expect(businessHoursForDate("2026-09-26", hours)).toMatchObject({ weekday: 5, enabled: false });
    expect(businessHoursForDate("2026-09-27", hours)).toMatchObject({ weekday: 6, enabled: false });
  });

  it("treats a weekday with no configured row as closed", () => {
    expect(businessHoursForDate("2026-09-21", [])).toMatchObject({ weekday: 0, enabled: false });
    expect(businessHoursForDate("2026-09-27", hours.slice(0, 6))).toMatchObject({ weekday: 6, enabled: false });
  });

  it("treats anything that is not a real calendar date as closed, not Monday's row", () => {
    for (const date of ["", "not-a-date", "2026-9-1", "2026-13-01", "2026-02-31", "2027-02-29", "2026-04-31"]) {
      expect(businessHoursForDate(date, hours)).toMatchObject({ enabled: false });
    }
  });

  it("does not shift across a year boundary or a leap day", () => {
    // 2026-01-01 is a Thursday; 2028-02-29 a Tuesday.
    expect(businessHoursForDate("2026-01-01", []).weekday).toBe(3);
    expect(businessHoursForDate("2028-02-29", []).weekday).toBe(1);
  });
});
