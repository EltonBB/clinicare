import { describe, expect, it } from "vitest";

import {
  NO_DUE_REMINDER,
  orderByReminderUrgency,
  rotateForFairness,
  utcDayIndex,
} from "./reminder-fairness";

describe("rotateForFairness", () => {
  it("returns an empty list unchanged (no modulo-by-zero)", () => {
    expect(rotateForFairness([], 5)).toEqual([]);
  });

  it("does not rotate on day 0", () => {
    expect(rotateForFairness(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
  });

  it("advances the start by one tenant per day", () => {
    const tenants = ["a", "b", "c"];
    expect(rotateForFairness(tenants, 1)).toEqual(["b", "c", "a"]);
    expect(rotateForFairness(tenants, 2)).toEqual(["c", "a", "b"]);
  });

  it("wraps around after a full cycle", () => {
    expect(rotateForFairness(["a", "b", "c"], 3)).toEqual(["a", "b", "c"]);
  });

  it("never mutates the input", () => {
    const tenants = ["a", "b", "c"];
    rotateForFairness(tenants, 2);
    expect(tenants).toEqual(["a", "b", "c"]);
  });

  it("preserves every element exactly once", () => {
    const tenants = ["a", "b", "c", "d", "e"];
    const rotated = rotateForFairness(tenants, 3);
    expect([...rotated].sort()).toEqual([...tenants].sort());
    expect(rotated).toHaveLength(tenants.length);
  });

  it("handles a single-element list", () => {
    expect(rotateForFairness(["only"], 7)).toEqual(["only"]);
  });

  it("stays in range for a negative day index", () => {
    // Guards the naive `dayIndex % length`, which would yield a negative slice
    // index and silently reorder the list.
    expect(rotateForFairness(["a", "b", "c"], -1)).toEqual(["c", "a", "b"]);
  });

  it("truncates a non-integer day index instead of producing holes", () => {
    expect(rotateForFairness(["a", "b", "c"], 1.9)).toEqual(["b", "c", "a"]);
  });

  /**
   * The property the whole fix exists for: with a truncated run that only ever
   * reaches the first `budget` tenants, every tenant must still be reached
   * within `length` days. Before rotation the same tail was skipped forever.
   */
  it("reaches every tenant within one full cycle even when runs are truncated", () => {
    const tenants = ["a", "b", "c", "d", "e", "f"];
    const budget = 2; // only the first 2 tenants get processed each day
    const reached = new Set<string>();

    for (let day = 0; day < tenants.length; day++) {
      for (const tenant of rotateForFairness(tenants, day).slice(0, budget)) {
        reached.add(tenant);
      }
    }

    expect(reached.size).toBe(tenants.length);
  });

  it("starves nobody even when only one tenant fits per run", () => {
    const tenants = ["a", "b", "c", "d"];
    const reached = new Set<string>();

    for (let day = 0; day < tenants.length; day++) {
      reached.add(rotateForFairness(tenants, day)[0]!);
    }

    expect(reached.size).toBe(tenants.length);
  });
});

describe("utcDayIndex", () => {
  it("counts whole UTC days since the epoch", () => {
    expect(utcDayIndex(Date.UTC(1970, 0, 1, 0, 0, 0))).toBe(0);
    expect(utcDayIndex(Date.UTC(1970, 0, 2, 0, 0, 0))).toBe(1);
  });

  it("is stable across a single UTC day", () => {
    const start = Date.UTC(2026, 7, 28, 0, 0, 0);
    const end = Date.UTC(2026, 7, 28, 23, 59, 59);
    expect(utcDayIndex(start)).toBe(utcDayIndex(end));
  });

  it("advances by exactly one at the UTC midnight boundary", () => {
    const before = Date.UTC(2026, 7, 28, 23, 59, 59);
    const after = Date.UTC(2026, 7, 29, 0, 0, 0);
    expect(utcDayIndex(after) - utcDayIndex(before)).toBe(1);
  });

  it("advances by exactly one across a DST transition", () => {
    // Europe/Berlin shifts on 2026-10-25. A local-time day index could repeat
    // or skip a day here; the UTC index must not.
    const before = Date.UTC(2026, 9, 24, 12, 0, 0);
    const after = Date.UTC(2026, 9, 25, 12, 0, 0);
    expect(utcDayIndex(after) - utcDayIndex(before)).toBe(1);
  });
});

describe("orderByReminderUrgency", () => {
  const t = (id: string) => ({ id });

  it("puts the soonest-due tenant first", () => {
    const tenants = [t("a"), t("b"), t("c")];
    const due = new Map([
      ["a", 3_000],
      ["b", 1_000],
      ["c", 2_000],
    ]);
    expect(orderByReminderUrgency(tenants, due).map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("sorts tenants with no due reminder last", () => {
    const tenants = [t("idle"), t("urgent")];
    const due = new Map([["urgent", 500]]);
    expect(orderByReminderUrgency(tenants, due).map((x) => x.id)).toEqual([
      "urgent",
      "idle",
    ]);
  });

  it("keeps the incoming (rotated) order among tenants with no due reminder", () => {
    // Stability is what preserves the daily rotation's fairness as a tie-break.
    const rotated = [t("c"), t("a"), t("b")];
    const due = new Map<string, number>();
    expect(orderByReminderUrgency(rotated, due).map((x) => x.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("keeps the incoming order among tenants of identical urgency", () => {
    const rotated = [t("b"), t("c"), t("a")];
    const due = new Map([
      ["a", 1_000],
      ["b", 1_000],
      ["c", 1_000],
    ]);
    expect(orderByReminderUrgency(rotated, due).map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("does not mutate the input", () => {
    const rotated = [t("a"), t("b")];
    orderByReminderUrgency(rotated, new Map([["b", 1]]));
    expect(rotated.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("handles an empty list", () => {
    expect(orderByReminderUrgency([], new Map())).toEqual([]);
  });

  it("uses a finite sentinel so an all-idle comparator never returns NaN", () => {
    // Infinity - Infinity is NaN, which silently corrupts Array.prototype.sort.
    expect(Number.isFinite(NO_DUE_REMINDER)).toBe(true);
    expect(NO_DUE_REMINDER - NO_DUE_REMINDER).toBe(0);
  });

  it("still reaches every tenant across days when only the first fits", () => {
    // Urgency dominates, but idle tenants must still rotate rather than
    // permanently keeping one order.
    const tenants = [t("a"), t("b"), t("c")];
    const due = new Map<string, number>();
    const firstSeen = new Set<string>();

    for (let day = 0; day < tenants.length; day++) {
      const ordered = orderByReminderUrgency(
        rotateForFairness(tenants, day),
        due
      );
      firstSeen.add(ordered[0]!.id);
    }

    expect(firstSeen.size).toBe(tenants.length);
  });
});
