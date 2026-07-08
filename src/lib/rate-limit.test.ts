import { describe, expect, it } from "vitest";

import { checkRateLimit, clientIpFromHeaders } from "./rate-limit";

describe("clientIpFromHeaders", () => {
  it("prefers the platform-trusted x-real-ip over a spoofable x-forwarded-for", () => {
    // On Vercel the leftmost x-forwarded-for entry is attacker-prependable, while
    // x-real-ip is overwritten by the platform edge — so x-real-ip must win, or a
    // brute-forcer could rotate their per-IP rate-limit key.
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      "x-real-ip": "9.9.9.9",
    });
    expect(clientIpFromHeaders(headers)).toBe("9.9.9.9");
  });

  it("falls back to the first x-forwarded-for entry when x-real-ip is absent", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIpFromHeaders(headers)).toBe("1.2.3.4");
  });

  it("returns 'unknown' when no forwarding headers are present", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("checkRateLimit (in-memory fallback)", () => {
  it("allows up to the limit, then denies with a positive retry hint", async () => {
    const key = "vitest-rl-allow-then-deny";
    const rule = { limit: 3, windowMs: 60_000 };
    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await checkRateLimit(key, rule));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3].remaining).toBe(0);
  });

  it("counts remaining down to zero within the window", async () => {
    const key = "vitest-rl-remaining";
    const rule = { limit: 2, windowMs: 60_000 };
    expect((await checkRateLimit(key, rule)).remaining).toBe(1);
    expect((await checkRateLimit(key, rule)).remaining).toBe(0);
  });
});
