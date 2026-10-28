import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { mobileWriteBlocked, staffAuthResponse } from "./guard";

describe("staffAuthResponse", () => {
  it("passes the pre-auth retry delay while keeping the error body generic", async () => {
    const response = staffAuthResponse({
      status: 429,
      error: "Too many requests.",
      retryAfterSeconds: 12,
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(await response.json()).toEqual({ error: "Too many requests." });
  });

  it("does not invent a retry budget for an unauthorized request", () => {
    expect(
      staffAuthResponse({ status: 401, error: "Unauthorized." }).headers.has("Retry-After"),
    ).toBe(false);
  });
});

describe("mobileWriteBlocked", () => {
  it("lets a usable workspace write", () => {
    expect(
      mobileWriteBlocked({ billingMode: "COMPLIMENTARY", subscriptionStatus: "NONE", cancelAt: null, trialEndsAt: null, lockedAt: null })
    ).toBeNull();
  });

  it("refuses a staff write with a 403 once the plan has ended", async () => {
    const response = mobileWriteBlocked({
      billingMode: "SUBSCRIPTION",
      subscriptionStatus: "CANCELED",
      cancelAt: null,
      trialEndsAt: null,
      lockedAt: null,
    });
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: expect.stringContaining("read-only") });
  });
});
