import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fitsOperatingHours,
  isInsideOperatingHours,
  isSlotInsideOperatingHours,
  operatingWeekday,
} from "@/lib/operating-hours";

const findUnique = vi.fn();
const db = { businessHours: { findUnique } } as unknown as Parameters<typeof isInsideOperatingHours>[0];

const originalTimeZone = process.env.APP_TIME_ZONE;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_TIME_ZONE = "Europe/Budapest";
});

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.APP_TIME_ZONE;
  } else {
    process.env.APP_TIME_ZONE = originalTimeZone;
  }
});

const NINE_TO_FIVE = { isOpen: true, startTime: "09:00", endTime: "17:00" };
const minutes = (hours: number, mins = 0) => hours * 60 + mins;

describe("operatingWeekday", () => {
  it("maps the clinic's calendar days onto the schedule's Monday = 0 .. Sunday = 6", () => {
    // Oct 5 2026 is a Monday; noon UTC is the same day in the clinic's zone.
    const week = [5, 6, 7, 8, 9, 10, 11].map((day) => operatingWeekday(new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`)));

    expect(week).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("follows the clinic's zone, not UTC, around midnight", () => {
    // Sunday 22:30 UTC is already Monday 00:30 in Budapest (CEST).
    expect(operatingWeekday(new Date("2026-10-04T22:30:00.000Z"))).toBe(0);
    // Monday 22:30 UTC is Tuesday 00:30 there.
    expect(operatingWeekday(new Date("2026-10-05T22:30:00.000Z"))).toBe(1);
    // Monday 21:30 UTC is still Monday 23:30.
    expect(operatingWeekday(new Date("2026-10-05T21:30:00.000Z"))).toBe(0);

    process.env.APP_TIME_ZONE = "America/New_York";
    // Monday 03:30 UTC is still Sunday 23:30 in New York (EDT).
    expect(operatingWeekday(new Date("2026-10-05T03:30:00.000Z"))).toBe(6);
  });
});

describe("fitsOperatingHours", () => {
  it.each([
    ["inside the day", minutes(10), minutes(11), true],
    ["from opening to closing exactly", minutes(9), minutes(17), true],
    ["starting a minute before opening", minutes(8, 59), minutes(10), false],
    ["ending a minute after closing", minutes(16), minutes(17, 1), false],
    ["starting at closing time", minutes(17), minutes(17, 30), false],
    ["entirely before opening", minutes(7), minutes(8), false],
  ])("a booking %s", (_label, start, end, expected) => {
    expect(fitsOperatingHours(NINE_TO_FIVE, start, end)).toBe(expected);
  });

  it("treats a switched-off weekday as closed whatever its stored times are", () => {
    expect(fitsOperatingHours({ ...NINE_TO_FIVE, isOpen: false }, minutes(10), minutes(11))).toBe(false);
  });

  it("treats a weekday with no configured row as closed, not as a guessed 9-5", () => {
    expect(fitsOperatingHours(null, minutes(10), minutes(11))).toBe(false);
    expect(fitsOperatingHours(undefined, minutes(10), minutes(11))).toBe(false);
  });
});

describe("isInsideOperatingHours (the calendar save's check)", () => {
  // Monday Oct 5 2026, 09:00 in Budapest.
  const startAt = new Date("2026-10-05T07:00:00.000Z");

  it("reads the hours row of the booking's weekday and compares the wall-clock start and end", async () => {
    findUnique.mockResolvedValue(NINE_TO_FIVE);

    expect(await isInsideOperatingHours(db, { businessId: "biz_1", startAt, startTime: "09:00", endTime: "10:00" })).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { businessId_weekday: { businessId: "biz_1", weekday: 0 } },
      select: { isOpen: true, startTime: true, endTime: true },
    });
  });

  it("refuses a booking that starts early, ends late, or lands on a closed or unconfigured day", async () => {
    findUnique.mockResolvedValue(NINE_TO_FIVE);
    expect(await isInsideOperatingHours(db, { businessId: "biz_1", startAt, startTime: "08:30", endTime: "09:30" })).toBe(false);
    expect(await isInsideOperatingHours(db, { businessId: "biz_1", startAt, startTime: "16:30", endTime: "17:30" })).toBe(false);

    findUnique.mockResolvedValue({ ...NINE_TO_FIVE, isOpen: false });
    expect(await isInsideOperatingHours(db, { businessId: "biz_1", startAt, startTime: "10:00", endTime: "11:00" })).toBe(false);

    findUnique.mockResolvedValue(null);
    expect(await isInsideOperatingHours(db, { businessId: "biz_1", startAt, startTime: "10:00", endTime: "11:00" })).toBe(false);
  });
});

describe("isSlotInsideOperatingHours (a freed appointment, given as instants)", () => {
  // Monday Oct 5 2026, 16:00-16:30 in Budapest (CEST, UTC+2).
  const slot = {
    businessId: "biz_1",
    startAt: new Date("2026-10-05T14:00:00.000Z"),
    endAt: new Date("2026-10-05T14:30:00.000Z"),
  };

  it("reads the weekday's row and takes the slot's wall-clock times from the clinic's zone", async () => {
    findUnique.mockResolvedValue(NINE_TO_FIVE);

    expect(await isSlotInsideOperatingHours(db, slot)).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { businessId_weekday: { businessId: "biz_1", weekday: 0 } },
      select: { isOpen: true, startTime: true, endTime: true },
    });
  });

  it("is outside the hours when the clinic now closes before the slot ends, and inside when it closes exactly then", async () => {
    findUnique.mockResolvedValue({ ...NINE_TO_FIVE, endTime: "16:29" });
    expect(await isSlotInsideOperatingHours(db, slot)).toBe(false);

    findUnique.mockResolvedValue({ ...NINE_TO_FIVE, endTime: "16:30" });
    expect(await isSlotInsideOperatingHours(db, slot)).toBe(true);
  });

  it("is outside the hours when the clinic now opens after the slot starts", async () => {
    findUnique.mockResolvedValue({ ...NINE_TO_FIVE, startTime: "16:01", endTime: "20:00" });

    expect(await isSlotInsideOperatingHours(db, slot)).toBe(false);
  });

  it("is outside the hours on a closed or unconfigured weekday", async () => {
    findUnique.mockResolvedValue({ ...NINE_TO_FIVE, isOpen: false });
    expect(await isSlotInsideOperatingHours(db, slot)).toBe(false);

    findUnique.mockResolvedValue(null);
    expect(await isSlotInsideOperatingHours(db, slot)).toBe(false);
  });

  it("measures the slot the way Book pre-fills the booking form: its start plus its length", async () => {
    // 16:00 for 90 minutes ends at 17:30, after a 17:00 close.
    findUnique.mockResolvedValue(NINE_TO_FIVE);

    expect(
      await isSlotInsideOperatingHours(db, { ...slot, endAt: new Date("2026-10-05T15:30:00.000Z") })
    ).toBe(false);
    expect(
      await isSlotInsideOperatingHours(db, { ...slot, endAt: new Date("2026-10-05T15:00:00.000Z") })
    ).toBe(true);
  });

  it("uses the weekday of the clinic's local day for a slot just after local midnight", async () => {
    findUnique.mockResolvedValue({ isOpen: true, startTime: "00:00", endTime: "23:59" });

    // Sunday 22:30 UTC is Monday 00:30 in Budapest.
    await isSlotInsideOperatingHours(db, {
      businessId: "biz_1",
      startAt: new Date("2026-10-04T22:30:00.000Z"),
      endAt: new Date("2026-10-04T23:00:00.000Z"),
    });

    expect(findUnique.mock.calls[0][0].where.businessId_weekday.weekday).toBe(0);
  });
});
