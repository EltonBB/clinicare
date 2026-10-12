import { describe, expect, it } from "vitest";

import { isCovered, isValidMonthKey, monthGridRange, monthsToLoad } from "@/lib/calendar-range";

describe("monthGridRange", () => {
  it.each([
    // Sep 1 2026 is a Tuesday, Sep 30 a Wednesday.
    ["2026-09", "2026-08-31", "2026-10-04"],
    // Feb 1 2026 is a Sunday (back six days), Feb 28 a Saturday (forward one).
    ["2026-02", "2026-01-26", "2026-03-01"],
    // Leap year: Feb 29 2024 is a Thursday.
    ["2024-02", "2024-01-29", "2024-03-03"],
    // Feb 2027 starts on a Monday and ends on a Sunday: the grid is the month.
    ["2027-02", "2027-02-01", "2027-02-28"],
    // Year boundary: Jan 1 2026 is a Thursday, Dec 31 2025 a Wednesday.
    ["2026-01", "2025-12-29", "2026-02-01"],
    ["2025-12", "2025-12-01", "2026-01-04"],
  ])("draws %s from Monday %s to Sunday %s", (monthKey, from, to) => {
    expect(monthGridRange(monthKey)).toEqual({ from, to });
  });

  it("always spans whole Monday-to-Sunday weeks", () => {
    for (let month = 1; month <= 12; month += 1) {
      const range = monthGridRange(`2026-${String(month).padStart(2, "0")}`);

      expect(range).not.toBeNull();

      const from = new Date(`${range!.from}T00:00:00Z`);
      const to = new Date(`${range!.to}T00:00:00Z`);

      expect(from.getUTCDay()).toBe(1); // Monday
      expect(to.getUTCDay()).toBe(0); // Sunday
      expect(((to.getTime() - from.getTime()) / 86_400_000 + 1) % 7).toBe(0);
    }
  });

  it.each(["", "2026", "2026-9", "2026-13", "2026-00", "1999-12", "2101-01", "2026-09-01", "abcd-ef"])(
    "rejects the invalid month key %j",
    (monthKey) => {
      expect(isValidMonthKey(monthKey)).toBe(false);
      expect(monthGridRange(monthKey)).toBeNull();
    }
  );
});

// Every day from `from` to `to` inclusive, as YYYY-MM-DD keys.
function monthDays(from: string, to: string) {
  const days: string[] = [];

  for (
    let time = Date.parse(`${from}T00:00:00Z`);
    time <= Date.parse(`${to}T00:00:00Z`);
    time += 86_400_000
  ) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }

  return days;
}

describe("coverage", () => {
  const september = { from: "2026-08-31", to: "2026-10-04" };

  it("treats both ends of a range as covered", () => {
    expect(isCovered("2026-08-31", [september])).toBe(true);
    expect(isCovered("2026-10-04", [september])).toBe(true);
    expect(isCovered("2026-08-30", [september])).toBe(false);
    expect(isCovered("2026-10-05", [september])).toBe(false);
  });

  it("asks for nothing when every visible day is loaded", () => {
    // Week of Aug 31 – Sep 6 straddles two months but sits inside September's grid.
    const week = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];

    expect(monthsToLoad(week, [september], "2026-09")).toEqual([]);
  });

  it("loads only the viewed month for a month view, not its neighbours", () => {
    // August 2026's month view runs Mon Jul 27 – Sun Sep 6. With only September's
    // grid loaded, the leading July days must NOT trigger a July load: August's own
    // grid already includes them.
    const monthView = monthDays("2026-07-27", "2026-09-06");

    expect(monthsToLoad(monthView, [september], "2026-08")).toEqual(["2026-08"]);
  });

  it("loads one month for a week that straddles two unloaded months", () => {
    const week = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];

    // Viewing from either side of the boundary, one grid covers the whole week.
    expect(monthsToLoad(week, [], "2026-09")).toEqual(["2026-09"]);
    expect(monthsToLoad(week, [], "2026-08")).toEqual(["2026-08"]);
  });

  it("loads the viewed month for a single day", () => {
    expect(monthsToLoad(["2026-09-15"], [], "2026-09")).toEqual(["2026-09"]);
  });

  it("counts a day covered by any of several loaded ranges", () => {
    const august = { from: "2026-07-27", to: "2026-08-30" };

    expect(monthsToLoad(["2026-08-30", "2026-08-31"], [august, september], "2026-09")).toEqual([]);
  });

  it("still gives a day outside the viewed month's grid its own month", () => {
    // Defensive: should never happen in the workspace, but must not be dropped.
    expect(monthsToLoad(["2026-09-15", "2027-03-02"], [], "2026-09")).toEqual(["2026-09", "2027-03"]);
  });
});
