import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.fn();
const failure = vi.fn();
const set = vi.fn();
const del = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(),
  noteRedisStoreSucceeded: store,
  noteRedisFailure: failure,
}));

async function importFresh() {
  vi.resetModules();
  return import("./cron-lock");
}

describe("cron lock", () => {
  beforeEach(async () => {
    store.mockClear();
    failure.mockClear();
    set.mockReset();
    del.mockReset();
    const { getRedis } = await import("@/lib/redis");
    vi.mocked(getRedis).mockReturnValue({ set, del } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("acquires the lock and reports it as store evidence", async () => {
    set.mockResolvedValue("OK");
    const { acquireCronLock } = await importFresh();

    await expect(acquireCronLock("reminders", 300)).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith("vela:cron-lock:reminders", "1", {
      nx: true,
      ex: 300,
    });
    expect(store).toHaveBeenCalledTimes(1);
  });

  /**
   * Redis returns null (not a throw) when NX finds the key already set — the
   * exact "another run is in progress" case this lock exists to catch.
   *
   * Regression test: this originally asserted `store` WAS called on
   * contention, encoding the bug Codex found rather than catching it —
   * evaluating an NX precondition needs no memory allocation, so a contended
   * result proves nothing about whether Redis can actually store data.
   * Reporting it as evidence would let repeated contended probes satisfy the
   * breaker's recovery threshold while Redis is still genuinely degraded.
   */
  it("does not report contention as store evidence, and it isn't a fault either", async () => {
    set.mockResolvedValue(null);
    const { acquireCronLock } = await importFresh();

    await expect(acquireCronLock("reminders", 300)).resolves.toBe(false);
    expect(store).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });

  it("fails open — proceeds — when Redis is not configured", async () => {
    const { getRedis } = await import("@/lib/redis");
    vi.mocked(getRedis).mockReturnValue(null);
    const { acquireCronLock } = await importFresh();

    await expect(acquireCronLock("reminders", 300)).resolves.toBe(true);
    expect(set).not.toHaveBeenCalled();
  });

  it("fails open — proceeds — on a Redis fault, and reports the failure", async () => {
    set.mockRejectedValue(new Error("timeout"));
    const { acquireCronLock } = await importFresh();

    await expect(acquireCronLock("reminders", 300)).resolves.toBe(true);
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it("releases by deleting the key, without reporting it as store evidence", async () => {
    del.mockResolvedValue(1);
    const { releaseCronLock } = await importFresh();

    await releaseCronLock("reminders");
    expect(del).toHaveBeenCalledWith("vela:cron-lock:reminders");
    expect(store).not.toHaveBeenCalled();
  });

  it("does nothing when Redis is not configured", async () => {
    const { getRedis } = await import("@/lib/redis");
    vi.mocked(getRedis).mockReturnValue(null);
    const { releaseCronLock } = await importFresh();

    await releaseCronLock("reminders");
    expect(del).not.toHaveBeenCalled();
  });

  it("swallows a release fault — the TTL is the real backstop — and reports it", async () => {
    del.mockRejectedValue(new Error("timeout"));
    const { releaseCronLock } = await importFresh();

    await expect(releaseCronLock("reminders")).resolves.toBeUndefined();
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it("namespaces different lock names to different keys", async () => {
    set.mockResolvedValue("OK");
    const { acquireCronLock } = await importFresh();

    await acquireCronLock("reminders", 60);
    await acquireCronLock("analytics", 60);
    expect(set).toHaveBeenNthCalledWith(
      1,
      "vela:cron-lock:reminders",
      "1",
      expect.anything()
    );
    expect(set).toHaveBeenNthCalledWith(
      2,
      "vela:cron-lock:analytics",
      "1",
      expect.anything()
    );
  });
});
