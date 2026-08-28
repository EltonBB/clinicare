import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCached, invalidateCache } from "@/lib/cache";

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
