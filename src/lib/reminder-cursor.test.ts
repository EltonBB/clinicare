import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.fn();
const failure = vi.fn();
const get = vi.fn();
const set = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(),
  noteRedisStoreSucceeded: store,
  noteRedisFailure: failure,
}));

async function importFresh() {
  vi.resetModules();
  return import("./reminder-cursor");
}

describe("reminder cursor", () => {
  beforeEach(async () => {
    store.mockClear();
    failure.mockClear();
    get.mockReset();
    set.mockReset();
    const { getRedis } = await import("@/lib/redis");
    vi.mocked(getRedis).mockReturnValue({ get, set } as never);
  });

  it("reads back a stored value", async () => {
    get.mockResolvedValue(7);
    const { getReminderCursor } = await importFresh();

    await expect(getReminderCursor()).resolves.toBe(7);
  });

  it("defaults to 0 when nothing has been stored yet", async () => {
    get.mockResolvedValue(null);
    const { getReminderCursor } = await importFresh();

    await expect(getReminderCursor()).resolves.toBe(0);
  });

  it("defaults to 0 on a malformed stored value, rather than propagating garbage", async () => {
    get.mockResolvedValue("not-a-number");
    const { getReminderCursor } = await importFresh();

    await expect(getReminderCursor()).resolves.toBe(0);
  });

  it("defaults to 0 when Redis is not configured", async () => {
    const { getRedis } = await import("@/lib/redis");
    vi.mocked(getRedis).mockReturnValue(null);
    const { getReminderCursor } = await importFresh();

    await expect(getReminderCursor()).resolves.toBe(0);
    expect(get).not.toHaveBeenCalled();
  });

  it("defaults to 0 and reports the failure on a Redis fault", async () => {
    get.mockRejectedValue(new Error("timeout"));
    const { getReminderCursor } = await importFresh();

    await expect(getReminderCursor()).resolves.toBe(0);
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it("stores the value and reports it as breaker evidence", async () => {
    set.mockResolvedValue("OK");
    const { setReminderCursor } = await importFresh();

    await setReminderCursor(12);
    expect(set).toHaveBeenCalledWith("vela:reminder-cursor", 12);
    expect(store).toHaveBeenCalledTimes(1);
  });

  it("does nothing when Redis is not configured", async () => {
    const { getRedis } = await import("@/lib/redis");
    vi.mocked(getRedis).mockReturnValue(null);
    const { setReminderCursor } = await importFresh();

    await setReminderCursor(12);
    expect(set).not.toHaveBeenCalled();
  });

  it("swallows a write fault and reports it, rather than failing the run", async () => {
    set.mockRejectedValue(new Error("timeout"));
    const { setReminderCursor } = await importFresh();

    await expect(setReminderCursor(12)).resolves.toBeUndefined();
    expect(failure).toHaveBeenCalledTimes(1);
  });
});
