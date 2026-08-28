import { describe, expect, it, vi } from "vitest";

import { hasTimeFor, withDeadline } from "./deadline";

describe("hasTimeFor", () => {
  it("allows an operation that fits", () => {
    expect(hasTimeFor(1_000, 300, 500)).toBe(true);
  });

  it("refuses one that does not fit, even though the deadline hasn't passed", () => {
    // The whole point: a bare `now < deadlineAt` would allow this and then
    // block for the full reserve, running past the deadline.
    expect(hasTimeFor(1_000, 300, 900)).toBe(false);
  });

  it("treats an exactly-fitting operation as allowed", () => {
    expect(hasTimeFor(1_000, 300, 700)).toBe(true);
  });

  it("refuses once the deadline has passed", () => {
    expect(hasTimeFor(1_000, 0, 1_001)).toBe(false);
  });

  it("always allows when no deadline applies", () => {
    expect(hasTimeFor(undefined, 999_999)).toBe(true);
  });
});

describe("withDeadline", () => {
  it("returns the work's value when it wins", async () => {
    const result = await withDeadline(Promise.resolve("done"), Date.now() + 1_000, () => "fallback");
    expect(result).toBe("done");
  });

  it("returns the fallback when the deadline wins", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("done"), 200));
    const result = await withDeadline(slow, Date.now() + 20, () => "fallback");
    expect(result).toBe("fallback");
  });

  it("returns the fallback immediately when the deadline has already passed", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("done"), 200));
    const result = await withDeadline(slow, Date.now() - 1, () => "fallback");
    expect(result).toBe("fallback");
  });

  it("passes the work straight through when no deadline applies", async () => {
    const result = await withDeadline(Promise.resolve("done"), undefined, () => "fallback");
    expect(result).toBe("done");
  });

  it("does not surface a late rejection as an unhandled rejection", async () => {
    // The losing promise can't be cancelled, so it must be explicitly caught —
    // otherwise a slow failure crashes the process after we already responded.
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const failsLate = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("late failure")), 20)
    );
    const result = await withDeadline(failsLate, Date.now() + 5, () => "fallback");
    expect(result).toBe("fallback");

    await new Promise((resolve) => setTimeout(resolve, 60));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("does not mistake a falsy work value for a timeout", async () => {
    // A sentinel Symbol is used precisely so values like 0, "" or null can't
    // be read as "timed out".
    await expect(withDeadline(Promise.resolve(0), Date.now() + 1_000, () => -1)).resolves.toBe(0);
    await expect(
      withDeadline(Promise.resolve(null), Date.now() + 1_000, () => "fallback")
    ).resolves.toBeNull();
  });

  it("propagates a rejection that happens before the deadline", async () => {
    await expect(
      withDeadline(Promise.reject(new Error("boom")), Date.now() + 1_000, () => "fallback")
    ).rejects.toThrow("boom");
  });
});
