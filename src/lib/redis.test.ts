import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRedis,
  noteRedisResult,
  REDIS_REQUEST_TIMEOUT_MS,
  resetRedisForTests,
} from "./redis";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal stand-in for the Upstash REST endpoint. */
function startFakeUpstash(handler: http.RequestListener) {
  const server = http.createServer(handler);
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            // `close` alone waits for open sockets, and the hanging handler
            // never releases one — that would stall the whole suite.
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

/**
 * Answers every command with `OK`, instantly. The client auto-pipelines, so a
 * batched request (an array of commands) must get an array of results back.
 */
const healthy: http.RequestListener = (req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    const parsed = JSON.parse(body || "{}");
    const reply = Array.isArray(parsed)
      ? parsed.map(() => ({ result: "OK" }))
      : { result: "OK" };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply));
  });
};

/** Accepts the connection and never responds, so only the timeout ends it. */
const hangs: http.RequestListener = () => {};

/**
 * Point the client at `url` and NOTHING else. Clearing the `KV_REST_API_*` pair
 * is not optional: `readRedisConfig` prefers it, so leaving it set would send
 * these tests at the real Upstash database.
 */
function configureRedis(url: string) {
  resetRedisForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = url;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
}

const REDIS_ENV_KEYS = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

/** Snapshot every key `readRedisConfig` reads, so no test leaks into the next. */
function restoreRedisEnv(saved: Record<string, string | undefined>) {
  for (const key of REDIS_ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
}

function unconfigureRedis() {
  resetRedisForTests();
  for (const key of REDIS_ENV_KEYS) {
    delete process.env[key];
  }
}

describe("getRedis client configuration", () => {
  const saved = Object.fromEntries(
    REDIS_ENV_KEYS.map((key) => [key, process.env[key]])
  );

  afterEach(() => {
    resetRedisForTests();
    restoreRedisEnv(saved);
  });

  it("returns null when Redis is not configured", () => {
    unconfigureRedis();
    expect(getRedis()).toBeNull();
  });

  /**
   * The Upstash constructor throws `UrlError` on a malformed url, and both
   * consumers call `getRedis()` outside their try blocks — so without this
   * guard one typo'd env var 500s every authenticated page render.
   */
  it("degrades to null instead of throwing on a malformed url", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      configureRedis("not-a-url");
      expect(() => getRedis()).not.toThrow();
      expect(getRedis()).toBeNull();
      // Logged once at construction, not once per call.
      expect(error).toHaveBeenCalledTimes(1);
      // The url embeds the Upstash host; it must not reach the log.
      expect(vi.mocked(error).mock.calls[0]![0]).not.toContain("not-a-url");
    } finally {
      error.mockRestore();
    }
  });

  /**
   * The invariant behind `signal: () => AbortSignal.timeout(...)`.
   *
   * A static `AbortSignal.timeout(...)` is constructed once and shared by this
   * memoized client forever: it works until the timeout elapses and then aborts
   * every later call against a perfectly healthy Redis. This test fails within
   * a second of anyone "simplifying" that line.
   */
  it("uses a fresh timeout per call, so a healthy client keeps working", async () => {
    const server = await startFakeUpstash(healthy);
    try {
      configureRedis(server.url);
      const redis = getRedis();
      expect(redis).not.toBeNull();

      await expect(redis!.set("k", "v")).resolves.toBe("OK");
      await sleep(REDIS_REQUEST_TIMEOUT_MS + 100);
      // A shared signal would have aborted by now.
      await expect(redis!.set("k", "v")).resolves.toBe("OK");
    } finally {
      await server.close();
    }
  }, 10_000);

  it("rejects rather than resolving when a call times out", async () => {
    const server = await startFakeUpstash(hangs);
    try {
      configureRedis(server.url);
      const redis = getRedis();

      const startedAt = Date.now();
      // Must reject: a resolved value here would be fabricated, and callers
      // treat a resolved value as a genuine Redis reply.
      await expect(redis!.get("k")).rejects.toThrow();

      const elapsed = Date.now() - startedAt;
      expect(elapsed).toBeGreaterThanOrEqual(REDIS_REQUEST_TIMEOUT_MS - 50);
      // Bounded: the SDK's default 5-retry backoff measures ~4.3s here. The
      // ceiling is loose on purpose — it only has to catch a lost `retry`
      // config, not assert a latency budget on a shared CI runner.
      expect(elapsed).toBeLessThan(3_000);
    } finally {
      await server.close();
    }
  }, 10_000);
});

describe("circuit breaker", () => {
  const saved = Object.fromEntries(
    REDIS_ENV_KEYS.map((key) => [key, process.env[key]])
  );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Configured but never dialled — these tests only exercise breaker state.
    configureRedis("http://127.0.0.1:1");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetRedisForTests();
    restoreRedisEnv(saved);
  });

  const fail = (times: number) => {
    for (let i = 0; i < times; i++) {
      noteRedisResult(false);
    }
  };

  it("keeps serving the client while failures stay below the threshold", () => {
    fail(2);
    expect(getRedis()).not.toBeNull();
  });

  it("opens after three consecutive failures", () => {
    fail(3);
    expect(getRedis()).toBeNull();
  });

  it("warns once when it opens, naming the per-instance downgrade", () => {
    fail(3);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0]![0]).toContain("PER-INSTANCE");
  });

  /**
   * The read-ok / write-failing case: Upstash rejects writes once the free-tier
   * size cap is hit (a read-only token behaves the same), so every getCached
   * miss reports a successful GET immediately before its SET fails. Under a
   * consecutive-failure count this oscillated 0 -> 1 -> 0 forever, the breaker
   * never opened, and every request kept paying the write timeout AND re-running
   * its producer. A success must not erase a persistent failure streak.
   */
  it("opens when reads succeed but writes keep failing", () => {
    for (let request = 0; request < 3; request++) {
      noteRedisResult(true); // GET succeeded
      noteRedisResult(false); // SET failed
    }
    expect(getRedis()).toBeNull();
  });

  it("does not trip on blips spread wider than the failure window", () => {
    fail(2);
    vi.advanceTimersByTime(60_001);
    fail(2);
    expect(getRedis()).not.toBeNull();
  });

  it("ages failures out of the window rather than counting them forever", () => {
    fail(2);
    vi.advanceTimersByTime(60_001);
    fail(2);
    vi.advanceTimersByTime(60_001);
    fail(2);
    expect(getRedis()).not.toBeNull();
  });

  it("counts failures that fall inside one window", () => {
    fail(1);
    vi.advanceTimersByTime(20_000);
    fail(1);
    vi.advanceTimersByTime(20_000);
    fail(1);
    expect(getRedis()).toBeNull();
  });

  it("clears the window on recovery, so a later blip starts from zero", () => {
    fail(3);
    vi.advanceTimersByTime(30_000);
    noteRedisResult(true); // probe recovers
    expect(getRedis()).not.toBeNull();

    fail(2);
    expect(getRedis()).not.toBeNull();
  });

  it("lets one probe through once the cooldown lapses", () => {
    fail(3);
    expect(getRedis()).toBeNull();

    vi.advanceTimersByTime(30_000);
    expect(getRedis()).not.toBeNull();
  });

  /**
   * Half-open must be single-flight. Without it a burst arriving the moment the
   * cooldown lapses ALL get the client, all pay the timeout, and all re-run
   * their `getCached` producers — the sweep herd the breaker exists to prevent,
   * just once every cooldown instead of continuously.
   */
  it("admits only one probe, leaving concurrent callers on the fallback", () => {
    fail(3);
    vi.advanceTimersByTime(30_000);

    expect(getRedis()).not.toBeNull();
    expect(getRedis()).toBeNull();
    expect(getRedis()).toBeNull();
  });

  it("re-arms the window on a clock, so a silent probe cannot wedge it open", () => {
    fail(3);
    vi.advanceTimersByTime(30_000);
    // Probe taken and never reported back.
    expect(getRedis()).not.toBeNull();
    expect(getRedis()).toBeNull();

    // The next window still opens rather than staying shut forever.
    vi.advanceTimersByTime(30_000);
    expect(getRedis()).not.toBeNull();
  });

  it("keeps warning across a long outage, once per cooldown", () => {
    fail(3);
    expect(console.warn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    fail(1);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("re-opens when the probe also fails", () => {
    fail(3);
    vi.advanceTimersByTime(30_000);

    noteRedisResult(false);
    expect(getRedis()).toBeNull();
  });

  it("does not re-log for every failure during one cooldown", () => {
    fail(3);
    fail(20);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("closes and logs recovery when the probe succeeds", () => {
    fail(3);
    vi.advanceTimersByTime(30_000);

    noteRedisResult(true);
    expect(getRedis()).not.toBeNull();
    expect(vi.mocked(console.warn).mock.calls.at(-1)![0]).toContain("Recovered");
  });

  it("stays quiet about recovery when it never opened", () => {
    noteRedisResult(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns null for an unconfigured Redis regardless of breaker state", () => {
    unconfigureRedis();
    expect(getRedis()).toBeNull();
    noteRedisResult(true);
    expect(getRedis()).toBeNull();
  });
});
