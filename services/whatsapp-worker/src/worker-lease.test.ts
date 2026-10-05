import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPrismaLeaseStore, createWorkerLease, type LeaseStore } from "./worker-lease";

describe("createPrismaLeaseStore", () => {
  const table = { createMany: vi.fn(), updateMany: vi.fn() };
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
      safetyMs: 5_000,
      onLost,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T19:00:00Z"));
    claim = vi.fn().mockResolvedValue(true);
    onLost = vi.fn();
    store = { claim };
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

  it("rides out a database blip, but stops 5s before the lease could run out unrenewed", async () => {
    await lease().acquire(); // held until 19:00:30
    claim.mockRejectedValue(new Error("db down"));

    await vi.advanceTimersByTimeAsync(24_999);
    expect(onLost).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  // Codex #134: a stalled renewal must not keep the sockets up past the lease.
  it("stops on time while a renewal is still stuck in the database", async () => {
    await lease().acquire(); // held until 19:00:30
    let finish!: (held: boolean) => void;
    claim.mockReturnValueOnce(new Promise<boolean>((resolve) => (finish = resolve)));

    await vi.advanceTimersByTimeAsync(25_000);
    expect(onLost).toHaveBeenCalledTimes(1);

    finish(true); // the late renewal changes nothing
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it("counts a slow renewal's lease from before the call", async () => {
    await lease().acquire(); // held until 19:00:30
    // The renewal at :10 takes 12s: its lease runs to :40, so the deadline moves to :35.
    claim.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(true), 12_000)));
    claim.mockRejectedValue(new Error("db down"));

    await vi.advanceTimersByTimeAsync(34_999);
    expect(onLost).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("doesn't count a lease whose claim came back too late to use", async () => {
    // The first claim takes 26s: its lease (to :30) has under 5s left.
    claim.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(true), 26_000)));
    let acquired = false;
    void lease().acquire().then(() => (acquired = true));

    await vi.advanceTimersByTimeAsync(26_000);
    expect(acquired).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(acquired).toBe(true);
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it("renewing after a blip pushes the deadline out again", async () => {
    await lease().acquire();
    claim.mockRejectedValueOnce(new Error("db down")).mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onLost).not.toHaveBeenCalled();
  });

  it("stops waiting for the lease once stopped, and never renews it", async () => {
    claim.mockResolvedValue(false);
    const l = lease();
    const acquired = l.acquire();
    await vi.advanceTimersByTimeAsync(2_000);
    l.stop();
    await vi.advanceTimersByTimeAsync(2_000);
    await acquired;

    const calls = claim.mock.calls.length;
    claim.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(claim).toHaveBeenCalledTimes(calls);
  });

  // Codex #134: the lease is never handed over, only left to run out, and the
  // deadline still ends the process before it does.
  it("stops renewing on stop, even with a renewal in flight, but keeps the deadline", async () => {
    const l = lease();
    await l.acquire(); // held until 19:00:30
    let finish!: (held: boolean) => void;
    claim.mockReturnValueOnce(new Promise<boolean>((resolve) => (finish = resolve)));
    await vi.advanceTimersByTimeAsync(10_000); // a renewal starts and hangs

    l.stop();
    finish(true); // lands after stop: renews nothing, moves no deadline
    await vi.advanceTimersByTimeAsync(14_999);
    expect(onLost).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); // 19:00:25
    expect(onLost).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(claim).toHaveBeenCalledTimes(2);
  });
});
