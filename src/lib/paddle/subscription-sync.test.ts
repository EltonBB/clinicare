import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn(), cancelPaddleSubscription: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { business: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } } }));
vi.mock("./paddle-api", () => ({ cancelPaddleSubscription: mocks.cancelPaddleSubscription }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import type { PaddleConfig } from "./paddle-config";
import type { PaddleSubscription } from "./subscription-snapshot";
import { applySubscriptionSnapshot } from "./subscription-sync";

const CONFIG: PaddleConfig = {
  env: "sandbox",
  apiBase: "https://sandbox-api.paddle.com",
  apiKey: "k",
  webhookSecret: "s",
  clientToken: "t",
  prices: {
    BASIC: { MONTH: { trial: "pri_bm_t", noTrial: "pri_bm" }, YEAR: { trial: "pri_by_t", noTrial: "pri_by" } },
    PRO: { MONTH: { trial: "pri_pm_t", noTrial: "pri_pm" }, YEAR: { trial: "pri_py_t", noTrial: "pri_py" } },
  },
};

const OCCURRED = new Date("2026-10-26T12:00:00Z");

const SUB: PaddleSubscription = {
  id: "sub_new",
  status: "active",
  customer_id: "ctm_1",
  custom_data: { businessId: "biz_1" },
  current_billing_period: { starts_at: "2026-10-26T12:00:00Z", ends_at: "2026-11-26T12:00:00Z" },
  scheduled_change: null,
  canceled_at: null,
  items: [{ price: { id: "pri_bm" }, trial_dates: null }],
};

const CLINIC = {
  id: "biz_1",
  billingMode: "SUBSCRIPTION",
  subscriptionStatus: "NONE",
  paddleSubscriptionId: null,
  trialUsedAt: null,
  lockedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Drop answers a test queued but did not use, so none leaks into the next.
  mocks.findUnique.mockReset();
  mocks.updateMany.mockReset();
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.cancelPaddleSubscription.mockResolvedValue({});
});

describe("applySubscriptionSnapshot", () => {
  it("finds the clinic by its subscription id first", async () => {
    mocks.findUnique.mockResolvedValueOnce({ ...CLINIC, paddleSubscriptionId: "sub_new", subscriptionStatus: "ACTIVE" });

    expect(await applySubscriptionSnapshot(CONFIG, SUB, OCCURRED)).toBe("applied");
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique.mock.calls[0][0].where).toEqual({ paddleSubscriptionId: "sub_new" });
  });

  it("falls back to the clinic named at checkout, and only writes when the event isn't older", async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(CLINIC);

    expect(await applySubscriptionSnapshot(CONFIG, SUB, OCCURRED)).toBe("applied");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "biz_1",
        // Only if the clinic is still as read: no other subscription attached since.
        paddleSubscriptionId: null,
        billingMode: "SUBSCRIPTION",
        OR: [{ billingSyncedAt: null }, { billingSyncedAt: { lte: OCCURRED } }],
      },
      data: expect.objectContaining({ paddleSubscriptionId: "sub_new", subscriptionStatus: "ACTIVE", plan: "BASIC" }),
    });
  });

  it("is stale when a newer event already landed (Review Focus 1)", async () => {
    mocks.findUnique.mockResolvedValue({ ...CLINIC, paddleSubscriptionId: "sub_new" });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    expect(await applySubscriptionSnapshot(CONFIG, SUB, OCCURRED)).toBe("stale");
    // One fresh read before giving up, never a loop.
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });

  it("never lets a second subscription take over a clinic that already has a live one", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...CLINIC, paddleSubscriptionId: "sub_old", subscriptionStatus: "ACTIVE" });

    expect(await applySubscriptionSnapshot(CONFIG, SUB, OCCURRED)).toBe("unmatched");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    // ...and cancels the second one, so the clinic isn't charged twice.
    expect(mocks.cancelPaddleSubscription).toHaveBeenCalledWith(CONFIG, "sub_new");
  });

  it("refuses the losing subscription when two checkouts' webhooks race for one clinic", async () => {
    mocks.findUnique
      // First read: the clinic has no subscription yet...
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(CLINIC)
      // ...but the other checkout attached its own before this write landed.
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...CLINIC, paddleSubscriptionId: "sub_other", subscriptionStatus: "TRIALING" });
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await applySubscriptionSnapshot(CONFIG, SUB, OCCURRED)).toBe("unmatched");
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.cancelPaddleSubscription).toHaveBeenCalledWith(CONFIG, "sub_new");
  });

  it("cancels a paused subscription a new checkout replaces, so it can't resume and bill too", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...CLINIC, paddleSubscriptionId: "sub_paused", subscriptionStatus: "PAUSED" });

    expect(await applySubscriptionSnapshot(CONFIG, SUB, OCCURRED)).toBe("applied");
    expect(mocks.cancelPaddleSubscription).toHaveBeenCalledWith(CONFIG, "sub_paused");
    expect(mocks.cancelPaddleSubscription).not.toHaveBeenCalledWith(CONFIG, "sub_new");
  });

  it("doesn't cancel a refused subscription that has already ended", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...CLINIC, paddleSubscriptionId: "sub_old", subscriptionStatus: "ACTIVE" });

    expect(await applySubscriptionSnapshot(CONFIG, { ...SUB, status: "canceled" }, OCCURRED)).toBe("unmatched");
    expect(mocks.cancelPaddleSubscription).not.toHaveBeenCalled();
  });

  it("still answers when Paddle won't cancel a refused subscription", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...CLINIC, paddleSubscriptionId: "sub_old", subscriptionStatus: "ACTIVE" });
    mocks.cancelPaddleSubscription.mockRejectedValue(new Error("Paddle is down"));

    expect(await applySubscriptionSnapshot(CONFIG, SUB, OCCURRED)).toBe("unmatched");
  });

  it("refuses a second free trial for a clinic that has had its trial", async () => {
    const trial = {
      ...SUB,
      status: "trialing",
      items: [{ price: { id: "pri_bm_t" }, trial_dates: { starts_at: "2026-10-26T12:00:00Z", ends_at: "2026-11-09T12:00:00Z" } }],
    };
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...CLINIC, paddleSubscriptionId: "sub_old", subscriptionStatus: "CANCELED", trialUsedAt: new Date("2026-09-01") });

    expect(await applySubscriptionSnapshot(CONFIG, trial, OCCURRED)).toBe("unmatched");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.cancelPaddleSubscription).toHaveBeenCalledWith(CONFIG, "sub_new");
  });

  it("keeps a trial moving between plans on the clinic's own subscription", async () => {
    const trial = {
      ...SUB,
      status: "trialing",
      items: [{ price: { id: "pri_pm_t" }, trial_dates: { starts_at: "2026-10-20T12:00:00Z", ends_at: "2026-11-03T12:00:00Z" } }],
    };
    mocks.findUnique.mockResolvedValueOnce({
      ...CLINIC,
      paddleSubscriptionId: "sub_new",
      subscriptionStatus: "TRIALING",
      trialUsedAt: new Date("2026-10-20T12:00:00Z"),
    });

    expect(await applySubscriptionSnapshot(CONFIG, trial, OCCURRED)).toBe("applied");
    expect(mocks.cancelPaddleSubscription).not.toHaveBeenCalled();
  });

  it("never changes a free clinic, even when a checkout names it", async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...CLINIC, billingMode: "COMPLIMENTARY" });

    expect(await applySubscriptionSnapshot(CONFIG, SUB, OCCURRED)).toBe("unmatched");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.cancelPaddleSubscription).toHaveBeenCalledWith(CONFIG, "sub_new");
  });

  it("leaves a free clinic's old, ended subscription alone", async () => {
    mocks.findUnique.mockResolvedValueOnce({
      ...CLINIC,
      billingMode: "COMPLIMENTARY",
      paddleSubscriptionId: "sub_new",
      subscriptionStatus: "CANCELED",
    });

    expect(await applySubscriptionSnapshot(CONFIG, { ...SUB, status: "canceled" }, OCCURRED)).toBe("unmatched");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.cancelPaddleSubscription).not.toHaveBeenCalled();
  });

  it("lets a clinic whose old subscription ended subscribe again", async () => {
    mocks.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...CLINIC, paddleSubscriptionId: "sub_old", subscriptionStatus: "CANCELED" });

    expect(await applySubscriptionSnapshot(CONFIG, SUB, OCCURRED)).toBe("applied");
  });

  it("is unmatched without a clinic, or for a price this app doesn't sell", async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    expect(await applySubscriptionSnapshot(CONFIG, { ...SUB, custom_data: null }, OCCURRED)).toBe("unmatched");

    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    expect(await applySubscriptionSnapshot(CONFIG, SUB, OCCURRED)).toBe("unmatched");

    mocks.findUnique.mockResolvedValueOnce({ ...CLINIC, paddleSubscriptionId: "sub_new" });
    const other = { ...SUB, items: [{ price: { id: "pri_other" }, trial_dates: null }] };
    expect(await applySubscriptionSnapshot(CONFIG, other, OCCURRED)).toBe("unmatched");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
