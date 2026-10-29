import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthedBusiness: vi.fn(),
  paddleConfig: vi.fn(),
  getPaddleSubscription: vi.fn(),
  getPaddleAddress: vi.fn(),
  getPaddleBusiness: vi.fn(),
  updatePaddleAddress: vi.fn(),
  savePaddleBusiness: vi.fn(),
  setPaddleSubscriptionBusiness: vi.fn(),
  changePaddleSubscriptionPrice: vi.fn(),
  applySubscriptionSnapshot: vi.fn(),
  revalidatePath: vi.fn(),
  businessUpdate: vi.fn(),
  businessUpdateMany: vi.fn(),
  listPaddleTransactions: vi.fn(),
  getPaddleTransaction: vi.fn(),
  getPaddleInvoiceUrl: vi.fn(),
  schedulePaddleCancel: vi.fn(),
  resumePaddleSubscription: vi.fn(),
  getCardUpdateTransactionId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { business: { update: mocks.businessUpdate, updateMany: mocks.businessUpdateMany } },
}));

vi.mock("@/lib/business", () => ({ getAuthedBusiness: mocks.getAuthedBusiness }));
vi.mock("@/lib/paddle/paddle-config", () => ({ paddleConfig: mocks.paddleConfig }));
vi.mock("@/lib/paddle/paddle-api", () => ({
  getPaddleSubscription: mocks.getPaddleSubscription,
  getPaddleAddress: mocks.getPaddleAddress,
  getPaddleBusiness: mocks.getPaddleBusiness,
  updatePaddleAddress: mocks.updatePaddleAddress,
  savePaddleBusiness: mocks.savePaddleBusiness,
  setPaddleSubscriptionBusiness: mocks.setPaddleSubscriptionBusiness,
  PaddleApiError: class PaddleApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string | null,
      readonly fields: string[] = []
    ) {
      super("paddle");
    }
  },
  changePaddleSubscriptionPrice: mocks.changePaddleSubscriptionPrice,
  listPaddleTransactions: mocks.listPaddleTransactions,
  getPaddleTransaction: mocks.getPaddleTransaction,
  getPaddleInvoiceUrl: mocks.getPaddleInvoiceUrl,
  schedulePaddleCancel: mocks.schedulePaddleCancel,
  resumePaddleSubscription: mocks.resumePaddleSubscription,
  getCardUpdateTransactionId: mocks.getCardUpdateTransactionId,
}));
vi.mock("@/lib/paddle/subscription-sync", () => ({ applySubscriptionSnapshot: mocks.applySubscriptionSnapshot }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  cancelPlanAction,
  changeBillingPlanAction,
  endProTrialAction,
  getBillingHistoryAction,
  getInvoiceLinkAction,
  keepProAction,
  getBillingDetailsAction,
  saveBillingDetailsAction,
  resumePlanAction,
  startCardUpdateAction,
  startProTrialAction,
} from "./billing-actions";

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
  mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", address_id: "add_1", business_id: null });
  mocks.changePaddleSubscriptionPrice.mockResolvedValue({ id: "sub_1" });
  mocks.applySubscriptionSnapshot.mockResolvedValue("applied");
});

describe("billing details", () => {
  it("reads the address and company of the clinic's own subscription", async () => {
    mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", address_id: "add_1", business_id: "biz_1" });
    mocks.getPaddleAddress.mockResolvedValue({ id: "add_1", first_line: "Rruga 1", city: "Prishtina", postal_code: "10000", country_code: "XK" });
    mocks.getPaddleBusiness.mockResolvedValue({ id: "biz_1", name: "Clinic LLC", tax_identifier: "XK123" });
    expect(await getBillingDetailsAction()).toEqual({
      ok: true,
      details: { companyName: "Clinic LLC", taxNumber: "XK123", street: "Rruga 1", city: "Prishtina", postalCode: "10000", countryCode: "XK" },
    });
    expect(mocks.getPaddleSubscription).toHaveBeenCalledWith(CONFIG, "sub_1");
    expect(mocks.getPaddleAddress).toHaveBeenCalledWith(CONFIG, "ctm_1", "add_1");
  });

  it("saves the address and creates the company on first save", async () => {
    mocks.savePaddleBusiness.mockResolvedValue({ id: "biz_new" });
    const input = { companyName: "Clinic LLC", taxNumber: "", street: " Rruga 1 ", city: "Prishtina", postalCode: "" };
    expect(await saveBillingDetailsAction(input)).toEqual({ ok: true });
    expect(mocks.updatePaddleAddress).toHaveBeenCalledWith(CONFIG, "ctm_1", "add_1", { first_line: "Rruga 1", city: "Prishtina", postal_code: null });
    expect(mocks.savePaddleBusiness).toHaveBeenCalledWith(CONFIG, "ctm_1", null, { name: "Clinic LLC", tax_identifier: null });
    expect(mocks.setPaddleSubscriptionBusiness).toHaveBeenCalledWith(CONFIG, "sub_1", "biz_new");
  });

  it("drops the company when its name is cleared", async () => {
    mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", address_id: "add_1", business_id: "biz_1" });
    await saveBillingDetailsAction({ companyName: "", taxNumber: "", street: "", city: "", postalCode: "" });
    expect(mocks.savePaddleBusiness).not.toHaveBeenCalled();
    expect(mocks.setPaddleSubscriptionBusiness).toHaveBeenCalledWith(CONFIG, "sub_1", null);
  });

  it("asks for a company name with a VAT number, and names a VAT number Paddle refuses", async () => {
    expect(await saveBillingDetailsAction({ companyName: "", taxNumber: "XK1", street: "", city: "", postalCode: "" })).toEqual({
      ok: false,
      error: "Add the company name that goes with the VAT number.",
    });
    const { PaddleApiError } = await import("@/lib/paddle/paddle-api");
    mocks.savePaddleBusiness.mockRejectedValue(new PaddleApiError(400, "bad_request", ["tax_identifier"]));
    expect(await saveBillingDetailsAction({ companyName: "Clinic", taxNumber: "nope", street: "", city: "", postalCode: "" })).toEqual({
      ok: false,
      error: "That VAT number isn't valid. Check it, or leave it empty.",
    });
  });

  it("changes nothing when Paddle refuses the VAT number", async () => {
    const { PaddleApiError } = await import("@/lib/paddle/paddle-api");
    mocks.savePaddleBusiness.mockRejectedValue(new PaddleApiError(400, "bad_request", ["tax_identifier"]));
    await saveBillingDetailsAction({ companyName: "Clinic", taxNumber: "nope", street: "New street", city: "", postalCode: "" });
    expect(mocks.updatePaddleAddress).not.toHaveBeenCalled();
  });

  it("says so instead of dropping an address Paddle has no record for", async () => {
    mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", address_id: null, business_id: null });
    expect(await saveBillingDetailsAction({ companyName: "", taxNumber: "", street: "Rruga 1", city: "", postalCode: "" })).toMatchObject({
      ok: false,
    });
  });

  it("does nothing for a clinic without a running plan", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, subscriptionStatus: "CANCELED" }, user: { id: "u" } });
    expect(await getBillingDetailsAction()).toMatchObject({ ok: false });
    expect(await saveBillingDetailsAction({ companyName: "A", taxNumber: "", street: "", city: "", postalCode: "" })).toMatchObject({ ok: false });
    expect(mocks.updatePaddleAddress).not.toHaveBeenCalled();
  });
});

describe("changeBillingPlanAction", () => {
  it("moves a paying clinic to the new plan's regular price and applies the result now", async () => {
    expect(await changeBillingPlanAction({ plan: "PRO", interval: "YEAR" })).toEqual({ ok: true });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_py", { trialing: false });
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, { id: "sub_1" }, expect.any(Date));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("dates the snapshot by Paddle's own change time, so it can't outrank a newer webhook", async () => {
    const subscription = { id: "sub_1", updated_at: "2026-10-29T10:00:00Z" };
    mocks.changePaddleSubscriptionPrice.mockResolvedValue(subscription);
    await changeBillingPlanAction({ plan: "PRO", interval: "YEAR" });
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, subscription, new Date("2026-10-29T10:00:00Z"));
  });

  it("keeps a trial going by moving to the new plan's trial price, billing nothing now", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, subscriptionStatus: "TRIALING" }, user: { id: "u" } });
    await changeBillingPlanAction({ plan: "PRO", interval: "MONTH" });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_pm_t", { trialing: true });
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

describe("the owner-offered Pro trial", () => {
  const BASIC = { ...PAYING, plan: "BASIC", subscribedPlan: "BASIC", billingInterval: "YEAR", proTrialOfferedAt: new Date(), proTrialStartedAt: null, proTrialEndsAt: null };
  const ON_TRIAL = {
    ...BASIC,
    plan: "PRO",
    proTrialStartedAt: new Date(),
    proTrialEndsAt: new Date(Date.now() + 7 * 86_400_000),
  };

  it("starts once: Pro for 14 days, guarded against a double click", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: BASIC, user: { id: "u" } });
    mocks.businessUpdateMany.mockResolvedValue({ count: 1 });

    expect(await startProTrialAction()).toEqual({ ok: true });
    const { where, data } = mocks.businessUpdateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "biz_1", proTrialStartedAt: null });
    expect(data.plan).toBe("PRO");
    expect(data.proTrialEndsAt.getTime() - data.proTrialStartedAt.getTime()).toBe(14 * 86_400_000);

    mocks.businessUpdateMany.mockResolvedValue({ count: 0 });
    expect(await startProTrialAction()).toMatchObject({ ok: false });
  });

  it("can't be started without an offer", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...BASIC, proTrialOfferedAt: null }, user: { id: "u" } });
    expect(await startProTrialAction()).toMatchObject({ ok: false });
    expect(mocks.businessUpdateMany).not.toHaveBeenCalled();
  });

  it("keeping Pro moves the subscription to Pro at its billing period, then ends the trial", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: ON_TRIAL, user: { id: "u" } });

    expect(await keepProAction()).toEqual({ ok: true });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_py", { trialing: false });
    expect(mocks.businessUpdate).toHaveBeenCalledWith({ where: { id: "biz_1" }, data: { proTrialEndsAt: expect.any(Date) } });
  });

  it("going back to Basic changes nothing in billing", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: ON_TRIAL, user: { id: "u" } });

    expect(await endProTrialAction()).toEqual({ ok: true });
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
    expect(mocks.businessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: { plan: "BASIC", proTrialEndsAt: expect.any(Date) },
    });
  });
});

describe("getBillingHistoryAction", () => {
  it("reads the clinic's own customer's charges", async () => {
    mocks.listPaddleTransactions.mockResolvedValue([]);
    expect(await getBillingHistoryAction()).toEqual({ ok: true, history: { card: null, rows: [] } });
    expect(mocks.listPaddleTransactions).toHaveBeenCalledWith(CONFIG, "ctm_1");
  });

  it("says so when Paddle can't be reached", async () => {
    mocks.listPaddleTransactions.mockRejectedValue(new Error("timeout"));
    expect(await getBillingHistoryAction()).toEqual({ ok: false, error: "We couldn't load your invoices right now." });
  });
});

describe("getInvoiceLinkAction", () => {
  it("links an invoice of the clinic's own customer", async () => {
    mocks.getPaddleTransaction.mockResolvedValue({ customer_id: "ctm_1" });
    mocks.getPaddleInvoiceUrl.mockResolvedValue("https://paddle.example/invoice.pdf");
    expect(await getInvoiceLinkAction("txn_01abcdefghij")).toEqual({ ok: true, url: "https://paddle.example/invoice.pdf" });
  });

  it("refuses another customer's invoice and anything that isn't a transaction id", async () => {
    mocks.getPaddleTransaction.mockResolvedValue({ customer_id: "ctm_someone_else" });
    expect(await getInvoiceLinkAction("txn_01abcdefghij")).toEqual({ ok: false, error: "That invoice isn't available." });
    expect(await getInvoiceLinkAction({ not: "" })).toEqual({ ok: false, error: "That invoice isn't available." });
    expect(await getInvoiceLinkAction("../subscriptions/sub_1")).toEqual({ ok: false, error: "That invoice isn't available." });
    expect(mocks.getPaddleInvoiceUrl).not.toHaveBeenCalled();
  });
});

describe("cancelPlanAction / resumePlanAction", () => {
  it("schedules the end of a running plan and applies Paddle's answer now", async () => {
    mocks.schedulePaddleCancel.mockResolvedValue({ id: "sub_1" });
    expect(await cancelPlanAction()).toEqual({ ok: true });
    expect(mocks.schedulePaddleCancel).toHaveBeenCalledWith(CONFIG, "sub_1");
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, { id: "sub_1" }, expect.any(Date));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("resumes only a plan that is set to end", async () => {
    expect(await resumePlanAction()).toEqual({ ok: true });
    expect(mocks.resumePaddleSubscription).not.toHaveBeenCalled();

    mocks.getAuthedBusiness.mockResolvedValue({
      business: { ...PAYING, cancelAt: new Date(Date.now() + 86_400_000) },
      user: { id: "u" },
    });
    mocks.resumePaddleSubscription.mockResolvedValue({ id: "sub_1" });
    expect(await resumePlanAction()).toEqual({ ok: true });
    expect(mocks.resumePaddleSubscription).toHaveBeenCalledWith(CONFIG, "sub_1");
  });

  it("does nothing for a free clinic or one without a running plan", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, billingMode: "COMPLIMENTARY" }, user: { id: "u" } });
    expect(await cancelPlanAction()).toMatchObject({ ok: false });
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, subscriptionStatus: "CANCELED" }, user: { id: "u" } });
    expect(await cancelPlanAction()).toMatchObject({ ok: false });
    expect(mocks.schedulePaddleCancel).not.toHaveBeenCalled();
  });
});

describe("startCardUpdateAction", () => {
  it("opens a card update for the running subscription, a failing one included", async () => {
    mocks.getCardUpdateTransactionId.mockResolvedValue("txn_update");
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, subscriptionStatus: "PAST_DUE" }, user: { id: "u" } });
    expect(await startCardUpdateAction()).toEqual({ ok: true, transactionId: "txn_update" });
    expect(mocks.getCardUpdateTransactionId).toHaveBeenCalledWith(CONFIG, "sub_1");
  });
});
