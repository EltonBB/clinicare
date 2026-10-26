import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthedBusiness: vi.fn(),
  paddleConfig: vi.fn(),
  createPaddlePortalUrl: vi.fn(),
  changePaddleSubscriptionPrice: vi.fn(),
  applySubscriptionSnapshot: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/business", () => ({ getAuthedBusiness: mocks.getAuthedBusiness }));
vi.mock("@/lib/paddle/paddle-config", () => ({ paddleConfig: mocks.paddleConfig }));
vi.mock("@/lib/paddle/paddle-api", () => ({
  createPaddlePortalUrl: mocks.createPaddlePortalUrl,
  changePaddleSubscriptionPrice: mocks.changePaddleSubscriptionPrice,
}));
vi.mock("@/lib/paddle/subscription-sync", () => ({ applySubscriptionSnapshot: mocks.applySubscriptionSnapshot }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { changeBillingPlanAction, openBillingPortalAction } from "./billing-actions";

const CONFIG = {
  prices: {
    BASIC: { MONTH: { trial: "pri_bm_t", noTrial: "pri_bm" }, YEAR: { trial: "pri_by_t", noTrial: "pri_by" } },
    PRO: { MONTH: { trial: "pri_pm_t", noTrial: "pri_pm" }, YEAR: { trial: "pri_py_t", noTrial: "pri_py" } },
  },
};

const PAYING = {
  id: "biz_1",
  billingMode: "SUBSCRIPTION",
  subscriptionStatus: "ACTIVE",
  paddleCustomerId: "ctm_1",
  paddleSubscriptionId: "sub_1",
  cancelAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.paddleConfig.mockReturnValue(CONFIG);
  mocks.getAuthedBusiness.mockResolvedValue({ business: PAYING, user: { id: "u" } });
  mocks.createPaddlePortalUrl.mockResolvedValue("https://customer-portal.paddle.com/x");
  mocks.changePaddleSubscriptionPrice.mockResolvedValue({ id: "sub_1" });
  mocks.applySubscriptionSnapshot.mockResolvedValue("applied");
});

describe("openBillingPortalAction", () => {
  it("opens the portal for the clinic's own customer and subscription, even while read-only", async () => {
    expect(await openBillingPortalAction()).toEqual({ ok: true, url: "https://customer-portal.paddle.com/x" });
    expect(mocks.getAuthedBusiness).toHaveBeenCalledWith(expect.any(String), { access: "read" });
    expect(mocks.createPaddlePortalUrl).toHaveBeenCalledWith(CONFIG, "ctm_1", ["sub_1"]);
  });

  it("is unavailable without billing or a Paddle customer", async () => {
    mocks.paddleConfig.mockReturnValue(null);
    expect(await openBillingPortalAction()).toMatchObject({ ok: false });
    mocks.paddleConfig.mockReturnValue(CONFIG);
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, paddleCustomerId: null }, user: { id: "u" } });
    expect(await openBillingPortalAction()).toMatchObject({ ok: false });
    expect(mocks.createPaddlePortalUrl).not.toHaveBeenCalled();
  });
});

describe("changeBillingPlanAction", () => {
  it("moves a paying clinic to the new plan's regular price and applies the result now", async () => {
    expect(await changeBillingPlanAction({ plan: "PRO", interval: "YEAR" })).toEqual({ ok: true });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_py");
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, { id: "sub_1" }, expect.any(Date));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("keeps a trial going by moving to the new plan's trial price", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, subscriptionStatus: "TRIALING" }, user: { id: "u" } });
    await changeBillingPlanAction({ plan: "PRO", interval: "MONTH" });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_pm_t");
  });

  it("refuses a clinic with no live subscription, one set to end, a failing payment, or a free one", async () => {
    for (const business of [
      { ...PAYING, subscriptionStatus: "CANCELED" },
      { ...PAYING, cancelAt: new Date(Date.now() + 86_400_000) },
      { ...PAYING, subscriptionStatus: "PAST_DUE" },
      { ...PAYING, billingMode: "COMPLIMENTARY" },
    ]) {
      mocks.getAuthedBusiness.mockResolvedValue({ business, user: { id: "u" } });
      expect(await changeBillingPlanAction({ plan: "PRO", interval: "MONTH" })).toMatchObject({ ok: false });
    }
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
  });

  it("rejects an invalid plan before touching Paddle", async () => {
    expect(await changeBillingPlanAction({ plan: "ADVANCED" as "PRO", interval: "MONTH" })).toMatchObject({ ok: false });
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
  });

  it("reports a Paddle failure plainly", async () => {
    mocks.changePaddleSubscriptionPrice.mockRejectedValue(new Error("422"));
    expect(await changeBillingPlanAction({ plan: "PRO", interval: "MONTH" })).toEqual({
      ok: false,
      error: "We couldn't change your plan. Please try again.",
    });
  });
});
