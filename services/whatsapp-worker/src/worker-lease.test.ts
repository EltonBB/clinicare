import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPrismaLeaseStore, createWorkerLease, type LeaseStore } from "./worker-lease";

describe("createPrismaLeaseStore", () => {
  const table = { createMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() };
  const store = createPrismaLeaseStore({ whatsAppWorkerLease: table } as unknown as Parameters<
    typeof createPrismaLeaseStore
  >[0]);
  const NOW = new Date("2026-10-05T19:00:00Z");
  const UNTIL = new Date("2026-10-05T19:00:30Z");

  beforeEach(() => {
    vi.clearAllMocks();
    table.createMany.mockResolvedValue({ count: 0 });
    table.updateMany.mockResolvedValue({ count: 0 });
  });

  it("takes a lease nobody holds", async () => {
    table.createMany.mockResolvedValue({ count: 1 });
    expect(await store.claim({ holder: "a", expiresAt: UNTIL, now: NOW })).toBe(true);
    expect(table.createMany).toHaveBeenCalledWith({
      data: [{ id: "whatsapp-worker", holder: "a", expiresAt: UNTIL }],
      skipDuplicates: true,
    });
    expect(table.updateMany).not.toHaveBeenCalled();
  });

  it("renews its own lease or takes one that ran out, in one guarded update", async () => {
    table.updateMany.mockResolvedValue({ count: 1 });
    expect(await store.claim({ holder: "a", expiresAt: UNTIL, now: NOW })).toBe(true);
    expect(table.updateMany).toHaveBeenCalledWith({
      where: { id: "whatsapp-worker", OR: [{ holder: "a" }, { expiresAt: { lte: NOW } }] },
      data: { holder: "a", expiresAt: UNTIL },
    });
  });

  it("doesn't get a lease another instance still holds", async () => {
    expect(await store.claim({ holder: "a", expiresAt: UNTIL, now: NOW })).toBe(false);
  });

  it("releases only its own lease", async () => {
    await store.release("a");
    expect(table.deleteMany).toHaveBeenCalledWith({ where: { id: "whatsapp-worker", holder: "a" } });
  });
});

describe("createWorkerLease", () => {
  let claim: ReturnType<typeof vi.fn>;
  let onLost: ReturnType<typeof vi.fn>;
  let store: LeaseStore;

  function lease() {
    return createWorkerLease({
      store,
      holder: "me",
      ttlMs: 30_000,
      renewEveryMs: 10_000,
      retryEveryMs: 2_000,
      onLost,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T19:00:00Z"));
    claim = vi.fn().mockResolvedValue(true);
    onLost = vi.fn();
    store = { claim, release: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits while another instance holds the lease, then takes it", async () => {
    claim.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    let acquired = false;
    void lease().acquire().then(() => (acquired = true));

    await vi.advanceTimersByTimeAsync(2_000);
    expect(acquired).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(acquired).toBe(true);
    expect(claim).toHaveBeenCalledTimes(3);
    expect(claim).toHaveBeenLastCalledWith({
      holder: "me",
      now: new Date("2026-10-05T19:00:04Z"),
      expiresAt: new Date("2026-10-05T19:00:34Z"),
    });
  });

  it("keeps trying through database errors while waiting", async () => {
    claim.mockRejectedValueOnce(new Error("db down")).mockResolvedValue(true);
    const l = lease();
    const acquired = l.acquire();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(acquired).resolves.toBeUndefined();
  });

  it("renews while it holds the lease", async () => {
    await lease().acquire();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(claim).toHaveBeenCalledTimes(4);
    expect(onLost).not.toHaveBeenCalled();
  });

  it("stops at once when another instance has taken the lease", async () => {
    await lease().acquire();
    claim.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onLost).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it("rides out a database blip, but stops before the lease could run out unrenewed", async () => {
    await lease().acquire(); // held until 19:00:30
    claim.mockRejectedValue(new Error("db down"));

    await vi.advanceTimersByTimeAsync(10_000); // 19:00:10: next try at :20 still lands in time
    expect(onLost).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000); // 19:00:20: next try at :30 would be too late
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("renewing after a blip pushes the deadline out again", async () => {
    await lease().acquire();
    claim.mockRejectedValueOnce(new Error("db down")).mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onLost).not.toHaveBeenCalled();
  });

  it("stops renewing and lets go of the lease on release", async () => {
    const l = lease();
    await l.acquire();
    await l.release();
    expect(store.release).toHaveBeenCalledWith("me");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(onLost).not.toHaveBeenCalled();
  });
});
