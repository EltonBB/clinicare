import { describe, expect, it } from "vitest";

import { rotateForFairness } from "./reminder-fairness";

describe("rotateForFairness", () => {
  it("returns an empty list unchanged (no modulo-by-zero)", () => {
    expect(rotateForFairness([], 5)).toEqual([]);
  });

  it("does not rotate at offset 0", () => {
    expect(rotateForFairness(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
  });

  it("starts from the given offset", () => {
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

  it("stays in range for a negative offset", () => {
    // Guards the naive `offset % length`, which would yield a negative slice
    // index and silently reorder the list.
    expect(rotateForFairness(["a", "b", "c"], -1)).toEqual(["c", "a", "b"]);
  });

  it("truncates a non-integer offset instead of producing holes", () => {
    expect(rotateForFairness(["a", "b", "c"], 1.9)).toEqual(["b", "c", "a"]);
  });

  it("handles an offset stale relative to a list that shrank since it was set", () => {
    // The persisted cursor can outlive the exact list it was computed
    // against (a business disabled WhatsApp between runs). Must not throw or
    // produce an out-of-bounds slice.
    expect(rotateForFairness(["a", "b"], 47)).toEqual(["b", "a"]);
  });

  /**
   * The property Codex's finding is actually about. A caller that advances
   * the offset by a FIXED amount per run (the original, wrong version of
   * this fix) barely moves under sustained low throughput: with 50 items and
   * capacity for 3, +1 per run reaches item 49 only after ~47 runs. Advancing
   * by the ACTUAL number attempted each run reaches every item within
   * ceil(n / k) runs regardless of throughput — this is what makes "retried
   * next run" true rather than aspirational.
   */
  it("reaches every business within ceil(n/k) runs when the offset advances by the attempted count", () => {
    const n = 50;
    const k = 3; // only 3 businesses fit in a budget-constrained run
    const businesses = Array.from({ length: n }, (_, i) => i);
    const reached = new Set<number>();
    let cursor = 0;

    let runs = 0;
    while (reached.size < n) {
      const attempted = rotateForFairness(businesses, cursor).slice(0, k);
      attempted.forEach((b) => reached.add(b));
      cursor = (cursor + attempted.length) % n;
      runs += 1;
      if (runs > n) {
        throw new Error("did not converge — this is the bug Codex found");
      }
    }

    expect(runs).toBe(Math.ceil(n / k));
  });

  it("still reaches every business when a slow-starting run attempts 0", () => {
    // The advance amount can legitimately be 0 (deadline hit before a single
    // business started) — must not get stuck advancing by 0 forever.
    const businesses = ["a", "b", "c", "d"];
    let cursor = 0;
    cursor = (cursor + 0) % businesses.length; // a fully-starved run
    expect(rotateForFairness(businesses, cursor)).toEqual(["a", "b", "c", "d"]);

    cursor = (cursor + 2) % businesses.length; // next run attempts 2
    expect(rotateForFairness(businesses, cursor)).toEqual(["c", "d", "a", "b"]);
  });
});
