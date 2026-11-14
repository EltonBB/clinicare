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
  activatePaddleSubscription: vi.fn(),
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
  subscriptionLockFree: vi.fn(() => true),
  locksTaken: [] as unknown[][],
  upgradeAmounts: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: { update: mocks.businessUpdate, updateMany: mocks.businessUpdateMany },
    // The per-subscription lock: free unless a test says it's held.
    // Each lock taken is recorded as its (namespace, key) pair.
    $transaction: (run: (tx: { $queryRaw: (sql: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ locked: boolean }>> }) => unknown) =>
      run({
        $queryRaw: async (_sql, ...values) => {
          mocks.locksTaken.push(values);
          return [{ locked: mocks.subscriptionLockFree() }];
        },
      }),
  },
}));

vi.mock("@/lib/business", () => ({ getAuthedBusiness: mocks.getAuthedBusiness }));
// Paddle's fresh quote under the lock; the real path and comparison logic stay.
vi.mock("@/lib/billing-upgrade", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing-upgrade")>()),
  upgradeAmounts: mocks.upgradeAmounts,
}));
vi.mock("@/lib/paddle/paddle-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paddle/paddle-config")>()),
  paddleConfig: mocks.paddleConfig,
}));
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
  activatePaddleSubscription: mocks.activatePaddleSubscription,
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
  getBillingDetailsAction,
  saveBillingDetailsAction,
  resumePlanAction,
  startCardUpdateAction,
  startProTrialAction,
  upgradeToProAction,
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

/** Paddle's live subscription, as read under the lock: active, nothing scheduled. */
/** The quote the clinic saw on checkout, and (by default) what Paddle still says. */
const APPROVED = { currency: "EUR", dueMinor: 4500, recurringMinor: 8000 };

/** A subscription on Basic's monthly trial price, as Paddle shows it. */
const BASIC_TRIAL_ITEMS = [{ price: { id: "pri_bm_t" }, trial_dates: null }];

const LIVE = { id: "sub_1", status: "active", items: [], address_id: "add_1", business_id: null, scheduled_change: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.paddleConfig.mockReturnValue(CONFIG);
  mocks.getAuthedBusiness.mockResolvedValue({ business: PAYING, user: { id: "u" } });
  mocks.getPaddleSubscription.mockResolvedValue(LIVE);
  mocks.upgradeAmounts.mockResolvedValue({ ...APPROVED, nextBilledAt: "2026-12-01T00:00:00Z" });
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
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, plan: "PRO", subscribedPlan: "PRO" }, user: { id: "u" } });
    expect(await changeBillingPlanAction({ plan: "PRO", interval: "YEAR" })).toEqual({ ok: true });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_py", { trialing: false });
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, { id: "sub_1" }, expect.any(Date));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("dates the snapshot by Paddle's own change time, so it can't outrank a newer webhook", async () => {
    const subscription = { id: "sub_1", updated_at: "2026-10-29T10:00:00Z" };
    mocks.changePaddleSubscriptionPrice.mockResolvedValue(subscription);
    await changeBillingPlanAction({ plan: "BASIC", interval: "YEAR" });
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, subscription, new Date("2026-10-29T10:00:00Z"));
  });

  it("keeps Basic's trial going on a period change, billing nothing now", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, plan: "BASIC", subscriptionStatus: "TRIALING" }, user: { id: "u" } });
    mocks.getPaddleSubscription.mockResolvedValue({ ...LIVE, status: "trialing", items: [{ price: { id: "pri_bm_t" }, trial_dates: null }] });
    await changeBillingPlanAction({ plan: "BASIC", interval: "YEAR" });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_by_t", { trialing: true });
  });

  it("sends Basic → Pro to the upgrade checkout, on the trial or paying", async () => {
    for (const subscriptionStatus of ["TRIALING", "ACTIVE"]) {
      mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, plan: "BASIC", subscriptionStatus }, user: { id: "u" } });
      expect(await changeBillingPlanAction({ plan: "PRO", interval: "MONTH" })).toEqual({
        ok: false,
        error: "Upgrade to Pro from checkout, where you see what's due today.",
      });
    }
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
  });

  it("lets a clinic already trialing on Pro (before the rule) change its billing period", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, plan: "PRO", subscriptionStatus: "TRIALING" }, user: { id: "u" } });
    mocks.getPaddleSubscription.mockResolvedValue({ ...LIVE, status: "trialing", items: [{ price: { id: "pri_pm_t" }, trial_dates: null }] });
    await changeBillingPlanAction({ plan: "PRO", interval: "YEAR" });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_py_t", { trialing: true });
  });

  it("waits while an upgrade or another plan change holds the subscription", async () => {
    mocks.subscriptionLockFree.mockReturnValueOnce(false);
    expect(await changeBillingPlanAction({ plan: "BASIC", interval: "YEAR" })).toEqual({
      ok: false,
      error: "Another change to your plan is in progress. Wait a moment, then refresh this page.",
    });
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
  });

  it("never puts a Basic price over an upgrade another tab just paid for", async () => {
    // The page still shows Basic's trial; Paddle already has Pro, active.
    mocks.getAuthedBusiness.mockResolvedValue({
      business: { ...PAYING, plan: "BASIC", subscribedPlan: "BASIC", subscriptionStatus: "TRIALING" },
      user: { id: "u" },
    });
    const live = { ...LIVE, status: "active", items: [{ price: { id: "pri_pm" }, trial_dates: null }] };
    mocks.getPaddleSubscription.mockResolvedValue(live);
    expect(await changeBillingPlanAction({ plan: "BASIC", interval: "YEAR" })).toEqual({
      ok: false,
      error: "Your plan has just changed. Refresh this page to see it.",
    });
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
    // What Paddle has is recorded now, so the refresh shows Pro.
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, live, expect.any(Date));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("takes the same lock as the upgrade, keyed by the subscription", async () => {
    mocks.locksTaken.length = 0;
    await changeBillingPlanAction({ plan: "BASIC", interval: "YEAR" });
    mocks.getAuthedBusiness.mockResolvedValue({
      business: { ...PAYING, plan: "BASIC", subscribedPlan: "BASIC", billingInterval: "MONTH", proTrialEndsAt: null },
      user: { id: "u" },
    });
    await upgradeToProAction({ interval: "MONTH", approved: APPROVED });
    expect(mocks.locksTaken).toHaveLength(2);
    expect(mocks.locksTaken[0]).toEqual(mocks.locksTaken[1]);
    expect(mocks.locksTaken[0]).toContain("sub_1");
  });

  it("reports a change Paddle made as done even when recording it fails (the webhook repeats it)", async () => {
    mocks.applySubscriptionSnapshot.mockRejectedValue(new Error("db"));
    expect(await changeBillingPlanAction({ plan: "BASIC", interval: "YEAR" })).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("charges the regular price when Paddle has ended a trial the saved status still shows", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, plan: "BASIC", subscriptionStatus: "TRIALING" }, user: { id: "u" } });
    mocks.getPaddleSubscription.mockResolvedValue({ ...LIVE, status: "active", items: [{ price: { id: "pri_bm" }, trial_dates: null }] });
    await changeBillingPlanAction({ plan: "BASIC", interval: "YEAR" });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_by", { trialing: false });
  });

  it("refuses when Paddle shows a change the page doesn't (an end scheduled, a failed payment)", async () => {
    for (const live of [
      { ...LIVE, scheduled_change: { action: "cancel", effective_at: "2026-12-01T00:00:00Z" } },
      { ...LIVE, status: "past_due" },
    ]) {
      mocks.getPaddleSubscription.mockResolvedValue(live);
      expect(await changeBillingPlanAction({ plan: "BASIC", interval: "YEAR" })).toEqual({
        ok: false,
        error: "Your plan has just changed. Refresh this page to see it.",
      });
    }
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
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

describe("upgradeToProAction", () => {
  const BASIC = { ...PAYING, plan: "BASIC", subscribedPlan: "BASIC", billingInterval: "MONTH", proTrialEndsAt: null };
  const as = (business: object) => mocks.getAuthedBusiness.mockResolvedValue({ business, user: { id: "u" } });

  it("moves a clinic paying for Basic to Pro, charging the prorated difference now", async () => {
    as(BASIC);
    expect(await upgradeToProAction({ interval: "YEAR", approved: APPROVED })).toEqual({ ok: true });
    expect(mocks.activatePaddleSubscription).not.toHaveBeenCalled();
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_py", { trialing: false });
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("ends Basic's free trial with one Pro charge: the item moves to Pro, then the trial is activated", async () => {
    as({ ...BASIC, subscriptionStatus: "TRIALING" });
    mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", status: "trialing", items: BASIC_TRIAL_ITEMS });
    mocks.activatePaddleSubscription.mockResolvedValue({ id: "sub_1", status: "active", items: [] });
    expect(await upgradeToProAction({ interval: "MONTH", approved: APPROVED })).toEqual({ ok: true });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledTimes(1);
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_pm", { trialing: true });
    expect(mocks.activatePaddleSubscription).toHaveBeenCalledWith(CONFIG, "sub_1");
    expect(mocks.changePaddleSubscriptionPrice.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.activatePaddleSubscription.mock.invocationCallOrder[0]
    );
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, { id: "sub_1", status: "active", items: [] }, expect.any(Date));
  });

  it("charges nothing when Paddle's amount has changed since checkout showed it (credit used by a renewal)", async () => {
    as(BASIC);
    for (const now of [
      { ...APPROVED, dueMinor: 4600 },
      { ...APPROVED, recurringMinor: 8500 },
      { ...APPROVED, currency: "USD" },
      null,
    ]) {
      mocks.upgradeAmounts.mockResolvedValueOnce(now && { ...now, nextBilledAt: "2026-12-01T00:00:00Z" });
      expect(await upgradeToProAction({ interval: "MONTH", approved: APPROVED })).toEqual({
        ok: false,
        error: "The amount due has changed. Check the new amount, then pay.",
      });
    }
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
    expect(mocks.activatePaddleSubscription).not.toHaveBeenCalled();
    // Paddle's state is recorded so the refreshed checkout quotes the right path.
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(CONFIG, LIVE, expect.any(Date));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("asks Paddle for the quote of the trial state Paddle reports, not the saved one", async () => {
    as({ ...BASIC, subscriptionStatus: "TRIALING" });
    mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", status: "trialing", items: BASIC_TRIAL_ITEMS });
    mocks.activatePaddleSubscription.mockResolvedValue({ id: "sub_1", status: "active", items: [] });
    await upgradeToProAction({ interval: "YEAR", approved: APPROVED });
    expect(mocks.upgradeAmounts).toHaveBeenCalledWith(CONFIG, "sub_1", true, "YEAR");
  });

  it("refuses a payment that doesn't say which amount the clinic approved", async () => {
    as(BASIC);
    expect(await upgradeToProAction({ interval: "MONTH" } as never)).toMatchObject({ ok: false });
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
  });

  it("puts a trial back on Basic when the Pro charge is declined, so it never runs as a free Pro trial", async () => {
    as({ ...BASIC, subscriptionStatus: "TRIALING" });
    mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", status: "trialing", items: BASIC_TRIAL_ITEMS });
    mocks.activatePaddleSubscription.mockRejectedValue(new Error("declined"));
    expect(await upgradeToProAction({ interval: "YEAR", approved: APPROVED })).toEqual({
      ok: false,
      error: "The upgrade didn't go through. Check your card in Settings › Billing and try again.",
    });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenNthCalledWith(1, CONFIG, "sub_1", "pri_py", { trialing: true });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenNthCalledWith(2, CONFIG, "sub_1", "pri_bm_t", { trialing: true });
    expect(mocks.applySubscriptionSnapshot).not.toHaveBeenCalled();
  });

  it("puts back the exact price Paddle had, not one from a saved interval another tab just changed", async () => {
    // Saved: monthly. Paddle: the clinic switched its trial to yearly a moment ago.
    as({ ...BASIC, subscriptionStatus: "TRIALING", billingInterval: "MONTH" });
    mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", status: "trialing", items: [{ price: { id: "pri_by_t" }, trial_dates: null }] });
    mocks.activatePaddleSubscription.mockRejectedValue(new Error("declined"));
    expect(await upgradeToProAction({ interval: "MONTH", approved: APPROVED })).toMatchObject({ ok: false });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenLastCalledWith(CONFIG, "sub_1", "pri_by_t", { trialing: true });
  });

  it("puts a trial back on Basic when moving it to Pro times out (it may have applied)", async () => {
    as({ ...BASIC, subscriptionStatus: "TRIALING" });
    mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", status: "trialing", items: BASIC_TRIAL_ITEMS });
    mocks.changePaddleSubscriptionPrice.mockRejectedValueOnce(new Error("timeout"));
    expect(await upgradeToProAction({ interval: "MONTH", approved: APPROVED })).toMatchObject({ ok: false });
    expect(mocks.activatePaddleSubscription).not.toHaveBeenCalled();
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenLastCalledWith(CONFIG, "sub_1", "pri_bm_t", { trialing: true });
  });

  it("never undoes an activation that charged although our request timed out", async () => {
    as({ ...BASIC, subscriptionStatus: "TRIALING" });
    mocks.getPaddleSubscription.mockResolvedValueOnce({ id: "sub_1", status: "trialing", items: BASIC_TRIAL_ITEMS }).mockResolvedValueOnce({ id: "sub_1", status: "active", items: [] });
    mocks.activatePaddleSubscription.mockRejectedValue(new Error("timeout"));
    expect(await upgradeToProAction({ interval: "MONTH", approved: APPROVED })).toMatchObject({ ok: false });
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledTimes(1);
  });

  it("takes the paid route when Paddle has already ended the trial the saved status still shows", async () => {
    as({ ...BASIC, subscriptionStatus: "TRIALING" });
    mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", status: "active", items: [] });
    expect(await upgradeToProAction({ interval: "MONTH", approved: APPROVED })).toEqual({ ok: true });
    expect(mocks.activatePaddleSubscription).not.toHaveBeenCalled();
    expect(mocks.changePaddleSubscriptionPrice).toHaveBeenCalledWith(CONFIG, "sub_1", "pri_pm", { trialing: false });
  });

  it("reports a charged upgrade as done even when recording it fails (the webhook repeats it)", async () => {
    as(BASIC);
    mocks.applySubscriptionSnapshot.mockRejectedValue(new Error("db"));
    expect(await upgradeToProAction({ interval: "MONTH", approved: APPROVED })).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("runs one upgrade per subscription at a time (two tabs): the second is told to wait", async () => {
    as(BASIC);
    mocks.subscriptionLockFree.mockReturnValueOnce(false);
    expect(await upgradeToProAction({ interval: "YEAR", approved: APPROVED })).toEqual({
      ok: false,
      error: "An upgrade is already in progress. Wait a moment, then refresh this page.",
    });
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
  });

  it("charges nothing when another tab has already moved the subscription to Pro", async () => {
    as(BASIC);
    mocks.getPaddleSubscription.mockResolvedValue({ id: "sub_1", status: "active", items: [{ price: { id: "pri_pm" }, trial_dates: null }] });
    expect(await upgradeToProAction({ interval: "YEAR", approved: APPROVED })).toEqual({ ok: true });
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalled();
  });

  it("ends a running owner-offered Pro trial once the clinic pays for Pro", async () => {
    as({ ...BASIC, plan: "PRO", proTrialEndsAt: new Date(Date.now() + 86_400_000) });
    expect(await upgradeToProAction({ interval: "MONTH", approved: APPROVED })).toEqual({ ok: true });
    expect(mocks.businessUpdate).toHaveBeenCalledWith({ where: { id: "biz_1" }, data: { proTrialEndsAt: expect.any(Date) } });
  });

  it("says plainly when the payment doesn't go through, and changes nothing else", async () => {
    as(BASIC);
    mocks.changePaddleSubscriptionPrice.mockRejectedValue(new Error("declined"));
    expect(await upgradeToProAction({ interval: "MONTH", approved: APPROVED })).toEqual({
      ok: false,
      error: "The upgrade didn't go through. Check your card in Settings › Billing and try again.",
    });
    expect(mocks.applySubscriptionSnapshot).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a clinic already on Pro, one set to end, a failing card, or a bad period", async () => {
    for (const business of [
      { ...BASIC, subscribedPlan: "PRO", plan: "PRO" },
      { ...BASIC, cancelAt: new Date(Date.now() + 86_400_000) },
      { ...BASIC, subscriptionStatus: "PAST_DUE" },
    ]) {
      as(business);
      expect(await upgradeToProAction({ interval: "MONTH", approved: APPROVED })).toMatchObject({ ok: false });
    }
    as(BASIC);
    expect(await upgradeToProAction({ interval: "WEEK" as "MONTH", approved: APPROVED })).toMatchObject({ ok: false });
    expect(mocks.changePaddleSubscriptionPrice).not.toHaveBeenCalled();
    expect(mocks.activatePaddleSubscription).not.toHaveBeenCalled();
  });
});

describe("the free Pro trial", () => {
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
    expect(data.subscribedPlan).toBe("BASIC");
    expect(data.proTrialEndsAt.getTime() - data.proTrialStartedAt.getTime()).toBe(14 * 86_400_000);

    mocks.businessUpdateMany.mockResolvedValue({ count: 0 });
    expect(await startProTrialAction()).toMatchObject({ ok: false });
  });

  it("can't be started without an offer, or before 30 days of paid Basic", async () => {
    for (const proTrialOfferedAt of [null, new Date(Date.now() + 86_400_000)]) {
      mocks.getAuthedBusiness.mockResolvedValue({ business: { ...BASIC, proTrialOfferedAt }, user: { id: "u" } });
      expect(await startProTrialAction()).toMatchObject({ ok: false });
    }
    expect(mocks.businessUpdateMany).not.toHaveBeenCalled();
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

  it("waits while another change holds the subscription", async () => {
    mocks.subscriptionLockFree.mockReturnValueOnce(false);
    expect(await cancelPlanAction()).toEqual({
      ok: false,
      error: "Another change to your plan is in progress. Wait a moment, then refresh this page.",
    });
    expect(mocks.schedulePaddleCancel).not.toHaveBeenCalled();

    mocks.getAuthedBusiness.mockResolvedValue({ business: { ...PAYING, cancelAt: new Date(Date.now() + 86_400_000) }, user: { id: "u" } });
    mocks.subscriptionLockFree.mockReturnValueOnce(false);
    expect(await resumePlanAction()).toMatchObject({ ok: false });
    expect(mocks.resumePaddleSubscription).not.toHaveBeenCalled();
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
