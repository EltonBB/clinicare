import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getPaddleSubscription: vi.fn(),
  applySubscriptionSnapshot: vi.fn(),
  getReconcileCursor: vi.fn(),
  setReconcileCursor: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { business: { findMany: mocks.findMany } } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./paddle-api", () => ({ getPaddleSubscription: mocks.getPaddleSubscription }));
vi.mock("./subscription-sync", () => ({ applySubscriptionSnapshot: mocks.applySubscriptionSnapshot }));
vi.mock("@/lib/follow-up-cursor", () => ({
  getReconcileCursor: mocks.getReconcileCursor,
  setReconcileCursor: mocks.setReconcileCursor,
}));

import type { PaddleConfig } from "./paddle-config";
import { RECONCILE_BATCH, reconcileOverdueSubscriptions } from "./reconcile";

const CONFIG = {} as PaddleConfig;
const NOW = new Date("2026-10-26T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  // Drop answers a test queued but did not use, so none leaks into the next.
  mocks.findMany.mockReset();
  mocks.getPaddleSubscription.mockImplementation(async (_config, id: string) => ({ id }));
  mocks.applySubscriptionSnapshot.mockResolvedValue("applied");
  mocks.getReconcileCursor.mockResolvedValue(null);
});

describe("reconcileOverdueSubscriptions", () => {
  it("picks overdue usable subscriptions and paused ones, taking turns by id", async () => {
    mocks.findMany.mockResolvedValue([]);
    await reconcileOverdueSubscriptions(CONFIG, NOW);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        billingMode: "SUBSCRIPTION",
        paddleSubscriptionId: { not: null },
        OR: [
          {
            subscriptionStatus: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
            OR: [{ currentPeriodEndsAt: { lt: new Date("2026-10-26T11:00:00Z") } }, { cancelAt: { lt: NOW } }],
          },
          // No period to run out: a missed `resumed` event would keep it read-only for good.
          { subscriptionStatus: "PAUSED" },
        ],
      },
      select: { id: true, paddleSubscriptionId: true },
      orderBy: { id: "asc" },
      take: RECONCILE_BATCH,
    });
    expect(mocks.setReconcileCursor).not.toHaveBeenCalled();
  });

  it("carries on from where the last run stopped and rounds again from the start, so no clinic is starved", async () => {
    mocks.getReconcileCursor.mockResolvedValue("biz_5");
    mocks.findMany
      .mockResolvedValueOnce([{ id: "biz_7", paddleSubscriptionId: "sub_7" }])
      .mockResolvedValueOnce([{ id: "biz_2", paddleSubscriptionId: "sub_2" }]);
    await reconcileOverdueSubscriptions(CONFIG, NOW);

    // Rows that stay due (an unchanged one, a failed read) don't move, so the turn is kept separately.
    expect(mocks.findMany.mock.calls[0][0].where.id).toEqual({ gt: "biz_5" });
    expect(mocks.findMany.mock.calls[1][0].where.id).toEqual({ lte: "biz_5" });
    expect(mocks.findMany.mock.calls[1][0].take).toBe(RECONCILE_BATCH - 1);
    expect(mocks.getPaddleSubscription).toHaveBeenCalledTimes(2);
    expect(mocks.setReconcileCursor).toHaveBeenCalledWith("biz_2");
  });

  it("doesn't round again when the first page fills the batch", async () => {
    mocks.getReconcileCursor.mockResolvedValue("biz_0");
    const full = Array.from({ length: RECONCILE_BATCH }, (_, i) => ({ id: `biz_${i + 1}`, paddleSubscriptionId: `sub_${i}` }));
    mocks.findMany.mockResolvedValueOnce(full);
    await reconcileOverdueSubscriptions(CONFIG, NOW);

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.setReconcileCursor).toHaveBeenCalledWith(`biz_${RECONCILE_BATCH}`);
  });

  it("re-reads each from Paddle and dates it by Paddle's own last change, not the batch start (Review Focus 2)", async () => {
    mocks.findMany
      .mockResolvedValueOnce([
        { id: "biz_1", paddleSubscriptionId: "sub_1" },
        { id: "biz_2", paddleSubscriptionId: "sub_2" },
      ])
    mocks.getPaddleSubscription
      .mockResolvedValueOnce({ id: "sub_1", updated_at: "2026-10-26T11:58:00Z" })
      .mockResolvedValueOnce({ id: "sub_2" });
    mocks.applySubscriptionSnapshot.mockResolvedValueOnce("applied").mockResolvedValueOnce("stale");

    expect(await reconcileOverdueSubscriptions(CONFIG, NOW)).toEqual({ checked: 2, applied: 1, failed: 0 });
    // An event older than the state Paddle returned then arrives stale and changes nothing.
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(
      CONFIG,
      { id: "sub_1", updated_at: "2026-10-26T11:58:00Z" },
      new Date("2026-10-26T11:58:00Z")
    );
    // Without that date, the time it was read.
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, { id: "sub_2" }, NOW);
  });

  it("keeps going when one Paddle call fails", async () => {
    mocks.findMany
      .mockResolvedValueOnce([
        { id: "biz_1", paddleSubscriptionId: "sub_1" },
        { id: "biz_2", paddleSubscriptionId: "sub_2" },
      ])
    mocks.getPaddleSubscription.mockRejectedValueOnce(new Error("timeout"));

    expect(await reconcileOverdueSubscriptions(CONFIG, NOW)).toEqual({ checked: 2, applied: 1, failed: 1 });
  });
});
