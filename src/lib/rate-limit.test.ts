import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { noteRedisFailure, resetRedisForTests } from "./redis";
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

describe("checkRateLimit under an open circuit breaker", () => {
  const KEYS = [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ] as const;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

  afterEach(() => {
    resetRedisForTests();
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  /**
   * The limiter is cached per rule, so it is tempting to return the cached
   * instance before consulting `getRedis()`. That would let `checkRateLimit`
   * keep hitting a Redis the breaker has already given up on — every call
   * paying the full request timeout again — because a cached limiter still
   * issues a real command. The breaker must gate every call, hit or miss.
   *
   * The endpoint must HANG rather than refuse: a refused connection fails
   * instantly, so the bypass would be as fast as the guard and the timing below
   * would prove nothing.
   */
  it("stops using Redis once the breaker opens, even for a cached limiter", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const server = http.createServer(() => {}); // accepts, never responds
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const { port } = server.address() as AddressInfo;

    try {
      resetRedisForTests();
      for (const k of KEYS) delete process.env[k];
      process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${port}`;
      process.env.UPSTASH_REDIS_REST_TOKEN = "t";

      const rule = { limit: 5, windowMs: 60_000 };
      // Warm the limiter cache (this call hits the hanging server and times out).
      await checkRateLimit("vitest-breaker-warm", rule);
      for (let i = 0; i < 3; i++) noteRedisFailure();

      const startedAt = Date.now();
      const result = await checkRateLimit("vitest-breaker-open", rule);
      const elapsed = Date.now() - startedAt;

      expect(result.allowed).toBe(true);
      // No network call ran. A bypass would have paid the ~500ms timeout.
      expect(elapsed).toBeLessThan(200);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 15_000);
});
