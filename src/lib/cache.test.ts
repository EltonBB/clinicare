import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCached,
  getCachedVersioned,
  invalidateCache,
  invalidateCacheVersioned,
} from "@/lib/cache";

// These run on the in-memory fallback (no Redis env in tests), which is exactly
// the path that must work for dev / CI / unconfigured deploys.
describe("getCached (in-memory fallback)", () => {
  // Clear the process-global fallback map so cases are isolated by construction,
  // not just by unique key suffixes.
  beforeEach(() => {
    globalThis.velaMemoryCache?.clear();
  });

  it("runs the producer once on a miss, then serves the cached value", async () => {
    let calls = 0;
    const key = `test:hit:${Date.now()}`;
    const produce = async () => {
      calls += 1;
      return { value: 42 };
    };

    const first = await getCached(key, 60, produce);
    const second = await getCached(key, 60, produce);

    expect(first).toEqual({ value: 42 });
    expect(second).toEqual({ value: 42 });
    expect(calls).toBe(1); // second call was a cache hit
  });

  it("re-runs the producer after the key is invalidated", async () => {
    let calls = 0;
    const key = `test:invalidate:${Date.now()}`;
    const produce = async () => {
      calls += 1;
      return calls;
    };

    await getCached(key, 60, produce); // miss → calls = 1
    await invalidateCache(key);
    const afterInvalidate = await getCached(key, 60, produce); // miss → calls = 2

    expect(afterInvalidate).toBe(2);
    expect(calls).toBe(2);
  });

  it("treats different keys independently", async () => {
    const produceA = async () => "A";
    const produceB = async () => "B";
    const suffix = Date.now();

    expect(await getCached(`test:a:${suffix}`, 60, produceA)).toBe("A");
    expect(await getCached(`test:b:${suffix}`, 60, produceB)).toBe("B");
  });
});

describe("getCachedVersioned / invalidateCacheVersioned (in-memory fallback)", () => {
  beforeEach(() => {
    globalThis.velaMemoryCache?.clear();
  });

  it("runs the producer once on a miss, then serves the cached value", async () => {
    let calls = 0;
    const key = `test:versioned-hit:${Date.now()}`;
    const produce = async () => {
      calls += 1;
      return { value: 42 };
    };

    const first = await getCachedVersioned(key, 60, produce);
    const second = await getCachedVersioned(key, 60, produce);

    expect(first).toEqual({ value: 42 });
    expect(second).toEqual({ value: 42 });
    expect(calls).toBe(1);
  });

  it("re-runs the producer after invalidateCacheVersioned", async () => {
    let calls = 0;
    const key = `test:versioned-invalidate:${Date.now()}`;
    const produce = async () => {
      calls += 1;
      return calls;
    };

    await getCachedVersioned(key, 60, produce); // miss → calls = 1
    await invalidateCacheVersioned(key);
    const afterInvalidate = await getCachedVersioned(key, 60, produce); // miss → calls = 2

    expect(afterInvalidate).toBe(2);
  });

  // The scenario invalidateCacheVersioned exists to close: a producer that
  // started reading BEFORE an invalidation only finishes (and writes its
  // stale result) AFTER it. Plain invalidateCache's DEL does nothing to stop
  // that late write from resurrecting the stale value under the live key —
  // this proves the versioned path routes it to an orphaned key instead.
  it("a slow producer that resolves after invalidation cannot resurrect stale data", async () => {
    const key = `test:versioned-race:${Date.now()}`;

    // Reader A starts a "slow" read (e.g. a heavy DB query) that won't
    // resolve until we manually release it below. producerStarted resolves
    // exactly when slowProducer() is actually invoked — which only happens
    // after Reader A's version read completes and getCached determines it's
    // a miss — so awaiting it is a deterministic way to know Reader A has
    // committed to reading under v0, with no reliance on microtask timing.
    let releaseSlowProducer!: (value: string) => void;
    let markProducerStarted!: () => void;
    const producerStarted = new Promise<void>((resolve) => {
      markProducerStarted = resolve;
    });
    const slowProducer = () => {
      markProducerStarted();
      return new Promise<string>((resolve) => {
        releaseSlowProducer = resolve;
      });
    };
    const readerA = getCachedVersioned(key, 60, slowProducer);
    await producerStarted;

    // The write this reader raced against completes and invalidates —
    // bumping the version to v1 — before Reader A's slow producer resolves.
    await invalidateCacheVersioned(key);

    // A second reader, after invalidation, correctly misses (v1 has no
    // entry yet) and populates the cache with the real fresh value.
    const readerB = await getCachedVersioned(key, 60, async () => "fresh");
    expect(readerB).toBe("fresh");

    // Only now does Reader A's slow, pre-invalidation producer resolve. Its
    // "stale" result must land under the orphaned v0 key, not v1.
    releaseSlowProducer("stale");
    await readerA;

    // A third reader must still see "fresh" — Reader A's late write never
    // reached the live (v1) key.
    const readerC = await getCachedVersioned(key, 60, async () => "fresh");
    expect(readerC).toBe("fresh");
  });
});

describe("getCachedVersioned (version read fails)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/redis", () => ({
      getRedis: () => ({
        get: vi.fn().mockRejectedValue(new Error("unreachable")),
      }),
      noteRedisStoreSucceeded: vi.fn(),
      noteRedisFailure: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/redis");
  });

  it("bypasses caching (calls the producer directly) rather than guess the version", async () => {
    const cache = await import("@/lib/cache");
    const result = await cache.getCachedVersioned("test:versioned-fault", 60, async () => "direct");

    expect(result).toBe("direct");
  });
});

describe("getCachedVersioned / invalidateCacheVersioned (Redis path)", () => {
  const getRedisFn = vi.fn();
  const store = vi.fn();
  const failure = vi.fn();
  const get = vi.fn();
  const set = vi.fn().mockResolvedValue("OK");
  const incr = vi.fn().mockResolvedValue(1);
  const expire = vi.fn().mockResolvedValue(1);

  beforeEach(() => {
    vi.resetModules();
    getRedisFn.mockReset();
    getRedisFn.mockReturnValue({ get, set, incr, expire });
    store.mockClear();
    failure.mockClear();
    get.mockReset().mockResolvedValue(null); // no version counter yet → defaults to 0
    set.mockClear();
    incr.mockClear().mockResolvedValue(1);
    expire.mockClear().mockResolvedValue(1);
    vi.doMock("@/lib/redis", () => ({
      getRedis: getRedisFn,
      noteRedisStoreSucceeded: store,
      noteRedisFailure: failure,
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/redis");
  });

  it("resolves the backend exactly once per getCachedVersioned call, not once per sub-operation", async () => {
    const cache = await import("@/lib/cache");
    await cache.getCachedVersioned("test:versioned-redis-single-resolve", 60, async () => "fresh");

    // One resolution shared by both the version read and the data read/write —
    // not two independent ones that could disagree on backend (CodeRabbit).
    expect(getRedisFn).toHaveBeenCalledTimes(1);
  });

  it("reads the version key, then the versioned data key, on a miss", async () => {
    get.mockResolvedValueOnce(3); // version counter reads as 3
    get.mockResolvedValueOnce(null); // data key "...:v3" is a miss

    const cache = await import("@/lib/cache");
    const result = await cache.getCachedVersioned("test:versioned-redis-read", 60, async () => "fresh");

    expect(result).toBe("fresh");
    expect(get).toHaveBeenNthCalledWith(1, "vela:cache:test:versioned-redis-read:version");
    expect(get).toHaveBeenNthCalledWith(2, "vela:cache:test:versioned-redis-read:v3");
    expect(set).toHaveBeenCalledWith(
      "vela:cache:test:versioned-redis-read:v3",
      "fresh",
      { ex: 60 }
    );
  });

  it("invalidateCacheVersioned increments then sets an expiry on the version key, returning true", async () => {
    const cache = await import("@/lib/cache");
    const result = await cache.invalidateCacheVersioned("test:versioned-redis-invalidate");

    expect(result).toBe(true);
    expect(incr).toHaveBeenCalledWith("vela:cache:test:versioned-redis-invalidate:version");
    expect(expire).toHaveBeenCalledWith(
      "vela:cache:test:versioned-redis-invalidate:version",
      7 * 24 * 60 * 60
    );
    expect(store).toHaveBeenCalledTimes(1); // a completed INCR counts as breaker-recovery evidence
    expect(failure).not.toHaveBeenCalled();
  });

  it("retries a failed increment once and succeeds if the retry works", async () => {
    incr.mockRejectedValueOnce(new Error("ETIMEDOUT")).mockResolvedValueOnce(2);

    const cache = await import("@/lib/cache");
    const result = await cache.invalidateCacheVersioned("test:versioned-redis-invalidate-retry");

    expect(result).toBe(true);
    expect(incr).toHaveBeenCalledTimes(2);
    expect(store).toHaveBeenCalledTimes(1);
    expect(failure).not.toHaveBeenCalled();
  });

  it("returns false and reports a failure after both increment attempts fail — never counted as a store", async () => {
    incr.mockRejectedValue(new Error("OOM command not allowed"));

    const cache = await import("@/lib/cache");
    const result = await cache.invalidateCacheVersioned("test:versioned-redis-invalidate-fail");

    expect(result).toBe(false);
    expect(incr).toHaveBeenCalledTimes(2); // initial attempt + one retry, then gave up
    expect(store).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it("still returns true when INCR succeeds but EXPIRE fails — invalidation itself already happened", async () => {
    expire.mockRejectedValueOnce(new Error("unreachable"));

    const cache = await import("@/lib/cache");
    const result = await cache.invalidateCacheVersioned("test:versioned-redis-expire-fail");

    expect(result).toBe(true); // the version WAS bumped — correctness is intact
    expect(store).toHaveBeenCalledTimes(1); // from the successful INCR
    expect(failure).toHaveBeenCalledTimes(1); // from the failed EXPIRE, for observability
    expect(incr).toHaveBeenCalledTimes(1); // EXPIRE failing does not re-run INCR
  });
});

/**
 * Which cache operations may count as breaker-recovery evidence.
 *
 * `SET` is denyoom-flagged, so it fails exactly when the store is full — the
 * condition the breaker guards — which makes a completed SET valid proof the
 * store works again. `DEL` is NOT denyoom-flagged: Redis keeps accepting it so
 * space can be freed, and deleting an absent key resolves with 0 regardless. A
 * DEL that "succeeds" therefore proves nothing, and reporting it would close the
 * breaker over a still-broken store.
 */
describe("cache operations as breaker evidence", () => {
  const store = vi.fn();
  const failure = vi.fn();
  const del = vi.fn().mockResolvedValue(1);
  const set = vi.fn().mockResolvedValue("OK");
  const get = vi.fn().mockResolvedValue(null);

  beforeEach(() => {
    vi.resetModules();
    store.mockClear();
    failure.mockClear();
    vi.doMock("@/lib/redis", () => ({
      getRedis: () => ({ get, set, del }),
      noteRedisStoreSucceeded: store,
      noteRedisFailure: failure,
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/redis");
  });

  it("does not count a successful delete as a store", async () => {
    const cache = await import("@/lib/cache");
    await cache.invalidateCache("evidence:del");

    expect(del).toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });

  it("counts a completed set as a store", async () => {
    const cache = await import("@/lib/cache");
    await cache.getCached("evidence:set", 60, async () => "fresh");

    expect(set).toHaveBeenCalled();
    expect(store).toHaveBeenCalledTimes(1);
  });

  it("reports a failed set as a failure, never as a store", async () => {
    set.mockRejectedValueOnce(new Error("OOM command not allowed"));
    const cache = await import("@/lib/cache");
    await cache.getCached("evidence:set-fail", 60, async () => "fresh");

    expect(store).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledTimes(1);
  });
});
