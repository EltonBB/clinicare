import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { staffAuthResponse } from "./guard";

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
