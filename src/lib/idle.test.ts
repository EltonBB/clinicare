import { describe, expect, it } from "vitest";

import { IDLE_SIGN_OUT_MS, IDLE_WARNING_MS, idleState, secondsLeft } from "./idle";

describe("idleState", () => {
  const start = 1_000_000;

  it("stays active until the warning window", () => {
    expect(idleState(start, start)).toBe("active");
    expect(idleState(start + IDLE_SIGN_OUT_MS - IDLE_WARNING_MS - 1, start)).toBe("active");
  });

  it("warns in the last minute and expires at the limit", () => {
    expect(idleState(start + IDLE_SIGN_OUT_MS - IDLE_WARNING_MS, start)).toBe("warning");
    expect(idleState(start + IDLE_SIGN_OUT_MS, start)).toBe("expired");
  });

  it("expires after a long sleep without passing through the warning", () => {
    expect(idleState(start + 5 * IDLE_SIGN_OUT_MS, start)).toBe("expired");
  });

  it("treats activity stamped in the future (another tab's clock) as active", () => {
    expect(idleState(start, start + 5_000)).toBe("active");
  });

  it("counts the seconds left, never below zero", () => {
    expect(secondsLeft(start + IDLE_SIGN_OUT_MS - 30_500, start)).toBe(31);
    expect(secondsLeft(start + IDLE_SIGN_OUT_MS + 10_000, start)).toBe(0);
  });
});
