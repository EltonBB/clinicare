import { describe, expect, it } from "vitest";

import { rowsThatFit, visibleEntryCount } from "@/lib/calendar-fit";

describe("rowsThatFit", () => {
  it("counts whole rows, including the gaps between them", () => {
    // 3 rows of 40 with two 6px gaps need 132px.
    expect(rowsThatFit(132, 40, 6)).toBe(3);
    expect(rowsThatFit(131, 40, 6)).toBe(2);
    expect(rowsThatFit(500, 40, 6)).toBe(11); // 11 * 40 + 10 * 6
    expect(rowsThatFit(499, 40, 6)).toBe(10);
  });

  it("always leaves room for one row, however short the space", () => {
    expect(rowsThatFit(10, 40, 6)).toBe(1);
    expect(rowsThatFit(0, 40, 6)).toBe(1);
    expect(rowsThatFit(-30, 40, 6)).toBe(1);
  });

  it("falls back to one row when the measurement is unusable", () => {
    expect(rowsThatFit(300, 0, 6)).toBe(1);
    expect(rowsThatFit(300, Number.NaN, 6)).toBe(1);
    expect(rowsThatFit(Number.NaN, 40, 6)).toBe(1);
  });
});

describe("visibleEntryCount", () => {
  it("shows every entry when they all fit", () => {
    expect(visibleEntryCount(0, 5)).toBe(0);
    expect(visibleEntryCount(5, 5)).toBe(5);
  });

  it("gives up one row to the '+N more' link when they do not", () => {
    expect(visibleEntryCount(6, 5)).toBe(4);
    expect(visibleEntryCount(31, 12)).toBe(11);
  });

  it("can show only the link when a single row fits", () => {
    expect(visibleEntryCount(3, 1)).toBe(0);
  });
});
