import { describe, expect, it } from "vitest";

import { getCached, invalidateCache } from "@/lib/cache";

// These run on the in-memory fallback (no Redis env in tests), which is exactly
// the path that must work for dev / CI / unconfigured deploys.
describe("getCached (in-memory fallback)", () => {
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
