import { describe, expect, it } from "vitest";

import { IDLE_SIGN_OUT_MS, IDLE_WARNING_MS, idleState, secondsLeft, startingActivity } from "./idle";

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

  it("keeps an abandoned session's deadline but starts a fresh login now", () => {
    const signedIn = start - 2 * IDLE_SIGN_OUT_MS;
    const lastSeen = start - IDLE_SIGN_OUT_MS - 1; // after sign-in, now run out
    expect(startingActivity(start, lastSeen, signedIn)).toBe(lastSeen);
    // Signed in again after that activity: a fresh session.
    expect(startingActivity(start, lastSeen, lastSeen + 1)).toBe(start);
    // Recent activity, nothing stored, or a stamp from the future all start now.
    expect(startingActivity(start, start - 60_000, signedIn)).toBe(start);
    expect(startingActivity(start, 0, signedIn)).toBe(start);
    expect(startingActivity(start, start + 60_000, signedIn)).toBe(start);
  });

  it("counts the seconds left, never below zero", () => {
    expect(secondsLeft(start + IDLE_SIGN_OUT_MS - 30_500, start)).toBe(31);
    expect(secondsLeft(start + IDLE_SIGN_OUT_MS + 10_000, start)).toBe(0);
  });
});
