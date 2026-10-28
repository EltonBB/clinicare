import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getPaddleSubscription: vi.fn(),
  applySubscriptionSnapshot: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { business: { findMany: mocks.findMany } } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./paddle-api", () => ({ getPaddleSubscription: mocks.getPaddleSubscription }));
vi.mock("./subscription-sync", () => ({ applySubscriptionSnapshot: mocks.applySubscriptionSnapshot }));

import type { PaddleConfig } from "./paddle-config";
import { RECONCILE_BATCH, reconcileOverdueSubscriptions } from "./reconcile";

const CONFIG = {} as PaddleConfig;
const NOW = new Date("2026-10-26T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPaddleSubscription.mockImplementation(async (_config, id: string) => ({ id }));
  mocks.applySubscriptionSnapshot.mockResolvedValue("applied");
});

describe("reconcileOverdueSubscriptions", () => {
  it("picks usable subscriptions whose period ended over an hour ago, or whose cancellation is due", async () => {
    mocks.findMany.mockResolvedValue([]);
    await reconcileOverdueSubscriptions(CONFIG, NOW);

    expect(mocks.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          billingMode: "SUBSCRIPTION",
          paddleSubscriptionId: { not: null },
          subscriptionStatus: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
          OR: [{ currentPeriodEndsAt: { lt: new Date("2026-10-26T11:00:00Z") } }, { cancelAt: { lt: NOW } }],
        },
        take: RECONCILE_BATCH,
      })
    );
  });

  it("also re-reads paused subscriptions with the room left, least recently synced first", async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: "biz_1", paddleSubscriptionId: "sub_1" }]).mockResolvedValueOnce([]);
    await reconcileOverdueSubscriptions(CONFIG, NOW);

    // A missed `resumed` event would otherwise leave the clinic read-only for good.
    expect(mocks.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { billingMode: "SUBSCRIPTION", paddleSubscriptionId: { not: null }, subscriptionStatus: "PAUSED" },
        orderBy: { billingSyncedAt: "asc" },
        take: RECONCILE_BATCH - 1,
      })
    );
  });

  it("skips the paused read when the overdue ones fill the batch", async () => {
    const full = Array.from({ length: RECONCILE_BATCH }, (_, i) => ({ id: `biz_${i}`, paddleSubscriptionId: `sub_${i}` }));
    mocks.findMany.mockResolvedValueOnce(full);
    await reconcileOverdueSubscriptions(CONFIG, NOW);

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
  });

  it("re-reads each from Paddle and dates it by Paddle's own last change, not the batch start (Review Focus 2)", async () => {
    mocks.findMany
      .mockResolvedValueOnce([
        { id: "biz_1", paddleSubscriptionId: "sub_1" },
        { id: "biz_2", paddleSubscriptionId: "sub_2" },
      ])
      .mockResolvedValueOnce([]);
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
      .mockResolvedValueOnce([]);
    mocks.getPaddleSubscription.mockRejectedValueOnce(new Error("timeout"));

    expect(await reconcileOverdueSubscriptions(CONFIG, NOW)).toEqual({ checked: 2, applied: 1, failed: 1 });
  });
});
