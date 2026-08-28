import { describe, expect, it } from "vitest";

import { rotateForFairness, utcHourIndex } from "./reminder-fairness";

describe("rotateForFairness", () => {
  it("returns an empty list unchanged (no modulo-by-zero)", () => {
    expect(rotateForFairness([], 5)).toEqual([]);
  });

  it("does not rotate on hour 0", () => {
    expect(rotateForFairness(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
  });

  it("advances the start by one business per hour", () => {
    const businesses = ["a", "b", "c"];
    expect(rotateForFairness(businesses, 1)).toEqual(["b", "c", "a"]);
    expect(rotateForFairness(businesses, 2)).toEqual(["c", "a", "b"]);
  });

  it("wraps around after a full cycle", () => {
    expect(rotateForFairness(["a", "b", "c"], 3)).toEqual(["a", "b", "c"]);
  });

  it("never mutates the input", () => {
    const businesses = ["a", "b", "c"];
    rotateForFairness(businesses, 2);
    expect(businesses).toEqual(["a", "b", "c"]);
  });

  it("preserves every element exactly once", () => {
    const businesses = ["a", "b", "c", "d", "e"];
    const rotated = rotateForFairness(businesses, 3);
    expect([...rotated].sort()).toEqual([...businesses].sort());
    expect(rotated).toHaveLength(businesses.length);
  });

  it("handles a single-element list", () => {
    expect(rotateForFairness(["only"], 7)).toEqual(["only"]);
  });

  it("stays in range for a negative hour index", () => {
    // Guards the naive `hourIndex % length`, which would yield a negative
    // slice index and silently reorder the list.
    expect(rotateForFairness(["a", "b", "c"], -1)).toEqual(["c", "a", "b"]);
  });

  it("truncates a non-integer hour index instead of producing holes", () => {
    expect(rotateForFairness(["a", "b", "c"], 1.9)).toEqual(["b", "c", "a"]);
  });

  /**
   * The property the whole fix exists for: with a truncated run that only
   * ever reaches the first `budget` businesses, every business must still be
   * reached within one full cycle. Before rotation, the same tail was skipped
   * forever — not "retried next hour" as the code's own comments claimed.
   */
  it("reaches every business within one full cycle even when runs are truncated", () => {
    const businesses = ["a", "b", "c", "d", "e", "f"];
    const budget = 2; // only the first 2 businesses get processed each run
    const reached = new Set<string>();

    for (let hour = 0; hour < businesses.length; hour++) {
      for (const business of rotateForFairness(businesses, hour).slice(0, budget)) {
        reached.add(business);
      }
    }

    expect(reached.size).toBe(businesses.length);
  });

  it("starves nobody even when only one business fits per run", () => {
    const businesses = ["a", "b", "c", "d"];
    const reached = new Set<string>();

    for (let hour = 0; hour < businesses.length; hour++) {
      reached.add(rotateForFairness(businesses, hour)[0]!);
    }

    expect(reached.size).toBe(businesses.length);
  });
});

describe("utcHourIndex", () => {
  it("counts whole UTC hours since the epoch", () => {
    expect(utcHourIndex(Date.UTC(1970, 0, 1, 0, 0, 0))).toBe(0);
    expect(utcHourIndex(Date.UTC(1970, 0, 1, 1, 0, 0))).toBe(1);
  });

  it("is stable across a single UTC hour", () => {
    const start = Date.UTC(2026, 7, 28, 10, 0, 0);
    const end = Date.UTC(2026, 7, 28, 10, 59, 59);
    expect(utcHourIndex(start)).toBe(utcHourIndex(end));
  });

  it("advances by exactly one at the UTC hour boundary", () => {
    const before = Date.UTC(2026, 7, 28, 10, 59, 59);
    const after = Date.UTC(2026, 7, 28, 11, 0, 0);
    expect(utcHourIndex(after) - utcHourIndex(before)).toBe(1);
  });

  it("advances by exactly one across a DST transition", () => {
    // Europe/Berlin shifts on 2026-10-25. A local-time hour index could
    // repeat or skip an hour here; the UTC index must not.
    const before = Date.UTC(2026, 9, 25, 0, 0, 0);
    const after = Date.UTC(2026, 9, 25, 1, 0, 0);
    expect(utcHourIndex(after) - utcHourIndex(before)).toBe(1);
  });
});
