import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.fn();
const failure = vi.fn();
const set = vi.fn();
const evalMock = vi.fn();

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
    evalMock.mockReset();
    const { getRedis } = await import("@/lib/redis");
    vi.mocked(getRedis).mockReturnValue({ set, eval: evalMock } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("acquires the lock with a fresh token and reports it as store evidence", async () => {
    set.mockResolvedValue("OK");
    const { acquireCronLock } = await importFresh();

    const result = await acquireCronLock("reminders", 300);
    expect(result.proceed).toBe(true);
    expect(result.token).toBeTruthy();
    expect(set).toHaveBeenCalledWith("vela:cron-lock:reminders", result.token, {
      nx: true,
      ex: 300,
    });
    expect(store).toHaveBeenCalledTimes(1);
  });

  it("uses a different token on each acquisition", async () => {
    set.mockResolvedValue("OK");
    const { acquireCronLock } = await importFresh();

    const first = await acquireCronLock("reminders", 300);
    const second = await acquireCronLock("reminders", 300);
    expect(first.token).not.toBe(second.token);
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

    await expect(acquireCronLock("reminders", 300)).resolves.toEqual({
      proceed: false,
      token: null,
    });
    expect(store).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });

  it("fails open — proceeds — when Redis is not configured, with no token to release later", async () => {
    const { getRedis } = await import("@/lib/redis");
    vi.mocked(getRedis).mockReturnValue(null);
    const { acquireCronLock } = await importFresh();

    await expect(acquireCronLock("reminders", 300)).resolves.toEqual({
      proceed: true,
      token: null,
    });
    expect(set).not.toHaveBeenCalled();
  });

  /**
   * Regression test for the P2 Codex found on the previous round: failing
   * open must not hand back a token. A caller that proceeded without ever
   * confirming it holds the lock has nothing to release — if it later called
   * DEL (or a compare-and-delete with a token nobody actually set), it could
   * evict a DIFFERENT invocation's real lock that this SET's timeout raced
   * against.
   */
  it("fails open — proceeds, with no token — on a Redis fault, and reports the failure", async () => {
    set.mockRejectedValue(new Error("timeout"));
    const { acquireCronLock } = await importFresh();

    await expect(acquireCronLock("reminders", 300)).resolves.toEqual({
      proceed: true,
      token: null,
    });
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it("releases via a compare-and-delete keyed on the token, without reporting it as store evidence", async () => {
    set.mockResolvedValue("OK");
    evalMock.mockResolvedValue(1);
    const { acquireCronLock, releaseCronLock } = await importFresh();

    const { token } = await acquireCronLock("reminders", 300);
    await releaseCronLock("reminders", token);

    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get"'),
      ["vela:cron-lock:reminders"],
      [token]
    );
    expect(store).toHaveBeenCalledTimes(1); // from acquire only
  });

  it("does nothing when there is no token to release (fail-open or contention)", async () => {
    const { releaseCronLock } = await importFresh();

    await releaseCronLock("reminders", null);
    expect(evalMock).not.toHaveBeenCalled();
  });

  it("does nothing when Redis is not configured", async () => {
    const { getRedis } = await import("@/lib/redis");
    vi.mocked(getRedis).mockReturnValue(null);
    const { releaseCronLock } = await importFresh();

    await releaseCronLock("reminders", "some-token");
    expect(evalMock).not.toHaveBeenCalled();
  });

  it("swallows a release fault — the TTL is the real backstop — and reports it", async () => {
    evalMock.mockRejectedValue(new Error("timeout"));
    const { releaseCronLock } = await importFresh();

    await expect(releaseCronLock("reminders", "some-token")).resolves.toBeUndefined();
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
      expect.any(String),
      expect.anything()
    );
    expect(set).toHaveBeenNthCalledWith(
      2,
      "vela:cron-lock:analytics",
      expect.any(String),
      expect.anything()
    );
  });
});
