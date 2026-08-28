import { describe, expect, it } from "vitest";

import { lastAttemptedId, rotateForFairness } from "./reminder-fairness";

function ids(...values: string[]) {
  return values.map((id) => ({ id }));
}

describe("rotateForFairness", () => {
  it("returns an empty list unchanged", () => {
    expect(rotateForFairness([], "a")).toEqual([]);
    expect(rotateForFairness([], null)).toEqual([]);
  });

  it("does not rotate when there is no prior cursor (null afterId)", () => {
    expect(rotateForFairness(ids("a", "b", "c"), null)).toEqual(ids("a", "b", "c"));
  });

  it("starts right after the given id", () => {
    const businesses = ids("a", "b", "c", "d");
    expect(rotateForFairness(businesses, "a")).toEqual(ids("b", "c", "d", "a"));
    expect(rotateForFairness(businesses, "b")).toEqual(ids("c", "d", "a", "b"));
  });

  it("wraps to the start when afterId was the last id in the list", () => {
    expect(rotateForFairness(ids("a", "b", "c"), "c")).toEqual(ids("a", "b", "c"));
  });

  it("never mutates the input", () => {
    const businesses = ids("a", "b", "c");
    rotateForFairness(businesses, "a");
    expect(businesses).toEqual(ids("a", "b", "c"));
  });

  it("preserves every element exactly once", () => {
    const businesses = ids("a", "b", "c", "d", "e");
    const rotated = rotateForFairness(businesses, "c");
    expect([...rotated].sort((x, y) => x.id.localeCompare(y.id))).toEqual(
      [...businesses].sort((x, y) => x.id.localeCompare(y.id))
    );
    expect(rotated).toHaveLength(businesses.length);
  });

  it("handles a single-element list", () => {
    expect(rotateForFairness(ids("only"), null)).toEqual(ids("only"));
    expect(rotateForFairness(ids("only"), "only")).toEqual(ids("only"));
  });

  /**
   * The exact scenario Codex found: A processed, cursor persisted as "A".
   * Between runs A becomes ineligible (WhatsApp disabled, connection status
   * changed) and drops out of the query. An ordinal offset of 1 into the new
   * 3-item list [B,C,D] would rotate to [C,D,B] — pushing B, which was never
   * attempted, to the BACK of the queue behind C and D. Resolving "after A"
   * by id instead finds the smallest remaining id greater than "a" — B — and
   * starts there, exactly where the rotation should resume.
   */
  it("resumes at the correct next business when the last-attempted one is no longer eligible", () => {
    const remaining = ids("b", "c", "d"); // "a" dropped out between runs
    expect(rotateForFairness(remaining, "a")).toEqual(ids("b", "c", "d"));
  });

  it("resumes at the smallest id greater than a removed middle business", () => {
    const remaining = ids("a", "c", "d"); // "b" (the last-attempted) dropped out
    expect(rotateForFairness(remaining, "b")).toEqual(ids("c", "d", "a"));
  });

  it("is unaffected by a NEW business inserted after the cursor", () => {
    // "b2" newly eligible, sorting between the last-attempted "b" and "c".
    const withInsertion = ids("a", "b", "b2", "c", "d");
    expect(rotateForFairness(withInsertion, "b")).toEqual(ids("b2", "c", "d", "a", "b"));
  });

  it("wraps to the start when the last-attempted id's whole tail is gone", () => {
    // Everything after "b" (c, d) became ineligible; only a and b remain.
    expect(rotateForFairness(ids("a", "b"), "d")).toEqual(ids("a", "b"));
  });

  /**
   * The property behind the earlier Codex finding still holds after
   * switching from an ordinal offset to an id anchor: every business is
   * reached within ceil(n / k) runs when nothing else changes.
   */
  it("reaches every business within ceil(n/k) runs with a stable list", () => {
    const n = 50;
    const k = 3;
    const businesses = Array.from({ length: n }, (_, i) => ({
      id: String(i).padStart(3, "0"),
    }));
    const reached = new Set<string>();
    let afterId: string | null = null;

    let runs = 0;
    while (reached.size < n) {
      const attempted = rotateForFairness(businesses, afterId).slice(0, k);
      attempted.forEach((b) => reached.add(b.id));
      afterId = attempted.length > 0 ? attempted[attempted.length - 1]!.id : afterId;
      runs += 1;
      if (runs > n) {
        throw new Error("did not converge");
      }
    }

    expect(runs).toBe(Math.ceil(n / k));
  });
});

describe("lastAttemptedId", () => {
  it("returns null when nothing was attempted", () => {
    expect(lastAttemptedId(ids("a", "b", "c"), 0)).toBeNull();
  });

  it("returns null for a negative count (defensive — should never happen)", () => {
    expect(lastAttemptedId(ids("a", "b", "c"), -1)).toBeNull();
  });

  it("returns the id at the end of the attempted prefix", () => {
    expect(lastAttemptedId(ids("a", "b", "c", "d"), 2)).toBe("b");
  });

  it("returns the last id when everything was attempted", () => {
    expect(lastAttemptedId(ids("a", "b", "c"), 3)).toBe("c");
  });

  it("returns null rather than reading out of bounds when attemptedCount exceeds the list", () => {
    expect(lastAttemptedId(ids("a", "b"), 5)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(lastAttemptedId([], 0)).toBeNull();
  });
});
