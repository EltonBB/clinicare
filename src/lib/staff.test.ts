import { describe, expect, it } from "vitest";

import { CHECK_IN_EARLY_GRACE_MS, findActiveShiftWindow } from "@/lib/staff";

describe("findActiveShiftWindow", () => {
  // A 09:00–17:00 shift on a fixed day; `now` is injected so the test is
  // timezone- and wall-clock-independent.
  const shift = {
    startsAt: new Date("2026-06-30T09:00:00.000Z"),
    endsAt: new Date("2026-06-30T17:00:00.000Z"),
  };

  it("matches inside the shift", () => {
    expect(findActiveShiftWindow([shift], new Date("2026-06-30T12:00:00.000Z"))).toBe(shift);
  });

  it("matches within the 30-min early grace before start", () => {
    const justInside = new Date(shift.startsAt.getTime() - CHECK_IN_EARLY_GRACE_MS + 1);
    expect(findActiveShiftWindow([shift], justInside)).toBe(shift);
  });

  it("rejects before the grace window opens", () => {
    const tooEarly = new Date(shift.startsAt.getTime() - CHECK_IN_EARLY_GRACE_MS - 1);
    expect(findActiveShiftWindow([shift], tooEarly)).toBeUndefined();
  });

  it("rejects after the shift ends — the 10pm bug", () => {
    expect(findActiveShiftWindow([shift], new Date("2026-06-30T22:00:00.000Z"))).toBeUndefined();
  });

  it("matches exactly at the end boundary, rejects one ms past it", () => {
    expect(findActiveShiftWindow([shift], shift.endsAt)).toBe(shift);
    expect(
      findActiveShiftWindow([shift], new Date(shift.endsAt.getTime() + 1))
    ).toBeUndefined();
  });

  it("returns undefined when there are no shifts", () => {
    expect(findActiveShiftWindow([], new Date("2026-06-30T12:00:00.000Z"))).toBeUndefined();
  });

  it("picks the covering shift among several", () => {
    const morning = {
      startsAt: new Date("2026-06-30T08:00:00.000Z"),
      endsAt: new Date("2026-06-30T11:00:00.000Z"),
    };
    const evening = {
      startsAt: new Date("2026-06-30T18:00:00.000Z"),
      endsAt: new Date("2026-06-30T22:00:00.000Z"),
    };
    expect(
      findActiveShiftWindow([morning, evening], new Date("2026-06-30T19:00:00.000Z"))
    ).toBe(evening);
    expect(
      findActiveShiftWindow([morning, evening], new Date("2026-06-30T13:00:00.000Z"))
    ).toBeUndefined();
  });
});
