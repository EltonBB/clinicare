"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getLocale } from "@/i18n/server";
import { USABLE_SUBSCRIPTION_STATUSES } from "@/lib/billing-access";
import { buildBillingHistory, type BillingHistory } from "@/lib/billing-history";
import { upgradePath } from "@/lib/billing-upgrade";
import { getAuthedBusiness } from "@/lib/business";
import { logger } from "@/lib/logger";
import {
  activatePaddleSubscription,
  changePaddleSubscriptionPrice,
  getCardUpdateTransactionId,
  getPaddleAddress,
  getPaddleBusiness,
  getPaddleInvoiceUrl,
  getPaddleSubscription,
  getPaddleTransaction,
  listPaddleTransactions,
  PaddleApiError,
  resumePaddleSubscription,
  savePaddleBusiness,
  schedulePaddleCancel,
  setPaddleSubscriptionBusiness,
  updatePaddleAddress,
} from "@/lib/paddle/paddle-api";
import { paddleConfig, type PaddleConfig } from "@/lib/paddle/paddle-config";
import { subscriptionChangedAt } from "@/lib/paddle/subscription-snapshot";
import { applySubscriptionSnapshot } from "@/lib/paddle/subscription-sync";
import { prisma } from "@/lib/prisma";
import { PRO_TRIAL_DAYS, proTrialState } from "@/lib/pro-trial";

const SESSION_EXPIRED = "Your session expired. Log in again to manage billing.";
const BILLING_UNAVAILABLE = "Billing isn't available right now. Please try again later.";

export type BillingActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** What invoices are addressed to: the company (optional), its VAT number, and the address. */
export type BillingDetails = {
  companyName: string;
  taxNumber: string;
  street: string;
  city: string;
  postalCode: string;
  countryCode: string;
};

/** The running subscription's billing details, read from Paddle when the clinic opens them. */
export async function getBillingDetailsAction(): Promise<BillingActionResult<{ details: BillingDetails }>> {
  const context = await getAuthedBusiness(SESSION_EXPIRED, { access: "read" });
  if ("error" in context) return { ok: false, error: context.error };
  const config = paddleConfig();
  const { business } = context;
  if (!config || !business.paddleCustomerId) return { ok: false, error: BILLING_UNAVAILABLE };
  const live = liveSubscription(business);
  if ("error" in live) return { ok: false, error: live.error };
  const customerId = business.paddleCustomerId;

  try {
    const subscription = await getPaddleSubscription(config, live.subscriptionId);
    const [address, company] = await Promise.all([
      subscription.address_id ? getPaddleAddress(config, customerId, subscription.address_id) : null,
      subscription.business_id ? getPaddleBusiness(config, customerId, subscription.business_id) : null,
    ]);
    return {
      ok: true,
      details: {
        companyName: company?.name ?? "",
        taxNumber: company?.tax_identifier ?? "",
        street: address?.first_line ?? "",
        city: address?.city ?? "",
        postalCode: address?.postal_code ?? "",
        countryCode: address?.country_code ?? "",
      },
    };
  } catch (error) {
    logger.error("Couldn't load the billing details.", error, { businessId: business.id });
    return { ok: false, error: "We couldn't load your billing details right now." };
  }
}

const optionalText = (max: number) => z.string().trim().max(max);
const detailsSchema = z.object({
  companyName: optionalText(100),
  taxNumber: optionalText(40),
  street: optionalText(200),
  city: optionalText(100),
  postalCode: optionalText(20),
});

/**
 * Saves the billing details on the running subscription: the address lines
 * (the country stays: it sets the tax), and the company with its VAT number,
 * created, renamed or dropped. Applies to invoices from now on.
 */
export async function saveBillingDetailsAction(input: z.input<typeof detailsSchema>): Promise<BillingActionResult> {
  const context = await getAuthedBusiness(SESSION_EXPIRED, { access: "read" });
  if ("error" in context) return { ok: false, error: context.error };
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some details are too long. Shorten them and try again." };
  const values = parsed.data;
  if (values.taxNumber && !values.companyName) {
    return { ok: false, error: "Add the company name that goes with the VAT number." };
  }
  const config = paddleConfig();
  const { business } = context;
  if (!config || !business.paddleCustomerId) return { ok: false, error: BILLING_UNAVAILABLE };
  const live = liveSubscription(business);
  if ("error" in live) return { ok: false, error: live.error };
  const customerId = business.paddleCustomerId;
  const orNull = (value: string) => value || null;

  try {
    const subscription = await getPaddleSubscription(config, live.subscriptionId);
    if (!subscription.address_id && (values.street || values.city || values.postalCode)) {
      return { ok: false, error: "We couldn't save the address. Write to us and we'll add it." };
    }
    // The company first: when Paddle rejects its VAT number, nothing has changed yet.
    if (values.companyName) {
      const company = await savePaddleBusiness(config, customerId, subscription.business_id ?? null, {
        name: values.companyName,
        tax_identifier: orNull(values.taxNumber),
      });
      if (company.id !== subscription.business_id) await setPaddleSubscriptionBusiness(config, live.subscriptionId, company.id);
    } else if (subscription.business_id) {
      await setPaddleSubscriptionBusiness(config, live.subscriptionId, null);
    }
    if (subscription.address_id) {
      await updatePaddleAddress(config, customerId, subscription.address_id, {
        first_line: orNull(values.street),
        city: orNull(values.city),
        postal_code: orNull(values.postalCode),
      });
    }
  } catch (error) {
    if (error instanceof PaddleApiError && error.fields.includes("tax_identifier")) {
      return { ok: false, error: "That VAT number isn't valid. Check it, or leave it empty." };
    }
    logger.error("Couldn't save the billing details.", error, { businessId: business.id });
    return { ok: false, error: "We couldn't save your billing details. Please try again." };
  }
  return { ok: true };
}

const UPGRADE_AT_CHECKOUT = "Upgrade to Pro from checkout, where you see what's due today.";

const changeSchema = z.object({ plan: z.enum(["BASIC", "PRO"]), interval: z.enum(["MONTH", "YEAR"]) });

/**
 * Moves the clinic's subscription to another plan or billing period, effective
 * now with Paddle's proration (during a trial nothing is charged before it
 * ends). The fresh subscription Paddle returns is applied at once, so the
 * workspace doesn't wait for the webhook to show the new plan.
 */
export async function changeBillingPlanAction(input: z.input<typeof changeSchema>): Promise<BillingActionResult> {
  const context = await getAuthedBusiness(SESSION_EXPIRED, { access: "read" });
  if ("error" in context) return { ok: false, error: context.error };
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That plan isn't available." };
  const config = paddleConfig();
  const { business } = context;
  if (!config || !business.paddleSubscriptionId) return { ok: false, error: BILLING_UNAVAILABLE };

  const usable = (USABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(business.subscriptionStatus);
  if (business.billingMode !== "SUBSCRIPTION" || !usable) {
    return { ok: false, error: "Choose a plan to start a new subscription instead." };
  }
  if (business.cancelAt && business.cancelAt > new Date()) {
    return { ok: false, error: "Your plan is set to end. Resume it first." };
  }
  if (business.subscriptionStatus === "PAST_DUE") {
    return { ok: false, error: "Your last payment didn't go through. Update your card first." };
  }

  // Basic → Pro has one path, Upgrade → checkout → Pay (upgradeToProAction),
  // which shows the amount first and ends a free trial (Pro is paid from day one).
  if (parsed.data.plan === "PRO" && (business.subscribedPlan ?? business.plan) === "BASIC") {
    return { ok: false, error: UPGRADE_AT_CHECKOUT };
  }

  // Keep the trial: a trialing subscription moves to the new plan's trial price.
  const trialing = business.subscriptionStatus === "TRIALING";
  const pair = config.prices[parsed.data.plan][parsed.data.interval];
  const priceId = trialing ? pair.trial : pair.noTrial;

  try {
    const subscription = await changePaddleSubscriptionPrice(config, business.paddleSubscriptionId, priceId, { trialing });
    await applySubscriptionSnapshot(config, subscription, subscriptionChangedAt(subscription, new Date()));
  } catch (error) {
    logger.error("Couldn't change the subscription's plan.", error, { businessId: business.id });
    return { ok: false, error: "We couldn't change your plan. Please try again." };
  }

  // Plan name, Pro features and the banner render on every workspace page.
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The clinic's charges and the card on file, read from Paddle when Settings › Billing opens. */
export async function getBillingHistoryAction(): Promise<BillingActionResult<{ history: BillingHistory }>> {
  const context = await getAuthedBusiness(SESSION_EXPIRED, { access: "read" });
  if ("error" in context) return { ok: false, error: context.error };
  const config = paddleConfig();
  const { business } = context;
  if (!config || !business.paddleCustomerId) return { ok: false, error: BILLING_UNAVAILABLE };

  try {
    const [transactions, locale] = await Promise.all([
      listPaddleTransactions(config, business.paddleCustomerId),
      getLocale(),
    ]);
    return { ok: true, history: buildBillingHistory(transactions, undefined, locale) };
  } catch (error) {
    logger.error("Couldn't load the billing history.", error, { businessId: business.id });
    return { ok: false, error: "We couldn't load your invoices right now." };
  }
}

const transactionIdSchema = z.string().regex(/^txn_[a-z0-9]{10,64}$/);

/** A short-lived link to one invoice PDF, only for a charge of this clinic's own Paddle customer. */
export async function getInvoiceLinkAction(transactionId: unknown): Promise<BillingActionResult<{ url: string }>> {
  const context = await getAuthedBusiness(SESSION_EXPIRED, { access: "read" });
  if ("error" in context) return { ok: false, error: context.error };
  const parsed = transactionIdSchema.safeParse(transactionId);
  if (!parsed.success) return { ok: false, error: "That invoice isn't available." };
  const config = paddleConfig();
  const { business } = context;
  if (!config || !business.paddleCustomerId) return { ok: false, error: BILLING_UNAVAILABLE };

  try {
    const transaction = await getPaddleTransaction(config, parsed.data);
    if (transaction.customer_id !== business.paddleCustomerId) return { ok: false, error: "That invoice isn't available." };
    return { ok: true, url: await getPaddleInvoiceUrl(config, parsed.data) };
  } catch (error) {
    logger.error("Couldn't open an invoice.", error, { businessId: business.id });
    return { ok: false, error: "We couldn't open that invoice. Please try again." };
  }
}

/** The clinic's running subscription, or why there isn't one to act on. */
function liveSubscription(business: {
  billingMode: string;
  subscriptionStatus: string;
  paddleSubscriptionId: string | null;
}): { subscriptionId: string } | { error: string } {
  const usable = (USABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(business.subscriptionStatus);
  if (business.billingMode !== "SUBSCRIPTION" || !usable || !business.paddleSubscriptionId) {
    return { error: "There's no running plan to change." };
  }
  return { subscriptionId: business.paddleSubscriptionId };
}

/**
 * Ends the plan when the current period (or trial) runs out; everything keeps
 * working until then. Paddle's answer is applied at once, like a plan change.
 */
export async function cancelPlanAction(): Promise<BillingActionResult> {
  const context = await getAuthedBusiness(SESSION_EXPIRED, { access: "read" });
  if ("error" in context) return { ok: false, error: context.error };
  const config = paddleConfig();
  const { business } = context;
  if (!config) return { ok: false, error: BILLING_UNAVAILABLE };
  const live = liveSubscription(business);
  if ("error" in live) return { ok: false, error: live.error };
  if (business.cancelAt && business.cancelAt > new Date()) return { ok: true };

  try {
    const subscription = await schedulePaddleCancel(config, live.subscriptionId);
    await applySubscriptionSnapshot(config, subscription, subscriptionChangedAt(subscription, new Date()));
  } catch (error) {
    logger.error("Couldn't schedule the plan's end.", error, { businessId: business.id });
    return { ok: false, error: "We couldn't cancel your plan. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Undoes a scheduled end: the plan renews as before. */
export async function resumePlanAction(): Promise<BillingActionResult> {
  const context = await getAuthedBusiness(SESSION_EXPIRED, { access: "read" });
  if ("error" in context) return { ok: false, error: context.error };
  const config = paddleConfig();
  const { business } = context;
  if (!config) return { ok: false, error: BILLING_UNAVAILABLE };
  const live = liveSubscription(business);
  if ("error" in live) return { ok: false, error: live.error };
  if (!business.cancelAt || business.cancelAt <= new Date()) return { ok: true };

  try {
    const subscription = await resumePaddleSubscription(config, live.subscriptionId);
    await applySubscriptionSnapshot(config, subscription, subscriptionChangedAt(subscription, new Date()));
  } catch (error) {
    logger.error("Couldn't resume the plan.", error, { businessId: business.id });
    return { ok: false, error: "We couldn't resume your plan. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * The Paddle transaction the card form opens to replace the card on file. While
 * a payment is failing, Paddle retries it with the new card.
 */
export async function startCardUpdateAction(): Promise<BillingActionResult<{ transactionId: string }>> {
  const context = await getAuthedBusiness(SESSION_EXPIRED, { access: "read" });
  if ("error" in context) return { ok: false, error: context.error };
  const config = paddleConfig();
  const { business } = context;
  if (!config) return { ok: false, error: BILLING_UNAVAILABLE };
  const live = liveSubscription(business);
  if ("error" in live) return { ok: false, error: live.error };

  try {
    return { ok: true, transactionId: await getCardUpdateTransactionId(config, live.subscriptionId) };
  } catch (error) {
    logger.error("Couldn't start a card update.", error, { businessId: business.id });
    return { ok: false, error: "We couldn't open the card form. Please try again." };
  }
}

/** Starts the owner-offered free Pro trial: Pro now, Basic billing unchanged. */
export async function startProTrialAction(): Promise<BillingActionResult> {
  const context = await getAuthedBusiness(SESSION_EXPIRED);
  if ("error" in context) return { ok: false, error: context.error };
  const now = new Date();
  if (proTrialState(context.business, now).kind !== "offered") {
    return { ok: false, error: "This offer isn't available any more." };
  }
  // Guarded in the write too: two clicks can't start it twice.
  const started = await prisma.business.updateMany({
    where: { id: context.business.id, proTrialStartedAt: null },
    data: {
      plan: "PRO",
      // What Paddle bills (Basic, checked above); a clinic from before this
      // field existed has none yet, and the expiry sweep matches on it.
      subscribedPlan: "BASIC",
      proTrialStartedAt: now,
      proTrialEndsAt: new Date(now.getTime() + PRO_TRIAL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  if (started.count === 0) return { ok: false, error: "This offer isn't available any more." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Keeps Pro after the trial: the subscription moves to the Pro price now (prorated). */
export async function keepProAction(): Promise<BillingActionResult> {
  const context = await getAuthedBusiness(SESSION_EXPIRED);
  if ("error" in context) return { ok: false, error: context.error };
  const { business } = context;
  const config = paddleConfig();
  if (!config || !business.paddleSubscriptionId) return { ok: false, error: BILLING_UNAVAILABLE };
  if (proTrialState(business).kind !== "active") return { ok: false, error: "Your Pro trial has already ended." };

  try {
    const priceId = config.prices.PRO[business.billingInterval ?? "MONTH"].noTrial;
    // A Pro trial is only offered on a paying (not trialing) subscription.
    const subscription = await changePaddleSubscriptionPrice(config, business.paddleSubscriptionId, priceId, {
      trialing: false,
    });
    await applySubscriptionSnapshot(config, subscription, subscriptionChangedAt(subscription, new Date()));
    await prisma.business.update({ where: { id: business.id }, data: { proTrialEndsAt: new Date() } });
  } catch (error) {
    logger.error("Couldn't move the subscription to Pro.", error, { businessId: business.id });
    return { ok: false, error: "We couldn't switch you to Pro. Please try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

const UPGRADE_FAILED = "The upgrade didn't go through. Check your card in Settings › Billing and try again.";

/**
 * Upgrade → checkout → Pay (owner decision, 2026-11-09): moves the clinic to
 * Pro now. A clinic paying for Basic is charged the prorated difference to its
 * card on file; Paddle only applies that change once the charge succeeds
 * (`prevent_change`), so a declined card leaves the plan as it was.
 *
 * A clinic on Basic's free trial pays Pro in full today (Pro is paid from day
 * one), as one charge: Paddle only lets a trialing subscription change price
 * without billing, so the item moves to Pro first and activating then ends the
 * trial and charges it. If that charge fails, the item goes back to Basic's
 * trial price, so a declined card never leaves a clinic on a free Pro trial.
 *
 * An owner-offered Pro trial that is running ends here: the clinic now pays for Pro.
 */
const upgradeSchema = z.object({ interval: z.enum(["MONTH", "YEAR"]) });

export async function upgradeToProAction(input: z.input<typeof upgradeSchema>): Promise<BillingActionResult> {
  const context = await getAuthedBusiness(SESSION_EXPIRED);
  if ("error" in context) return { ok: false, error: context.error };
  const parsed = upgradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That plan isn't available." };
  const { business } = context;
  const config = paddleConfig();
  if (!config || !business.paddleSubscriptionId) return { ok: false, error: BILLING_UNAVAILABLE };

  const path = upgradePath(business);
  if (path.kind === "already_pro") return { ok: false, error: "Your clinic is already on Pro." };
  if (path.kind === "resume_first") return { ok: false, error: "Your plan is set to end. Resume it first." };
  if (path.kind === "card_first") return { ok: false, error: "Your last payment didn't go through. Update your card first." };
  if (path.kind !== "change" && path.kind !== "end_trial") return { ok: false, error: "That plan isn't available." };

  const subscriptionId = business.paddleSubscriptionId;
  const proPrice = config.prices.PRO[parsed.data.interval].noTrial;
  const businessId = business.id;
  let subscription;
  try {
    // The trial route only while Paddle itself says the trial runs: the saved
    // status can lag (a webhook still on its way, an earlier attempt that
    // charged but couldn't record it), and re-running it on an active
    // subscription would undo a paid upgrade.
    const trialing = path.kind === "end_trial" && (await getPaddleSubscription(config, subscriptionId)).status === "trialing";
    if (trialing) {
      await changePaddleSubscriptionPrice(config, subscriptionId, proPrice, { trialing: true });
      try {
        subscription = await activatePaddleSubscription(config, subscriptionId);
      } catch (error) {
        await restoreBasicTrial(config, subscriptionId, config.prices.BASIC[business.billingInterval ?? "MONTH"].trial, businessId);
        throw error;
      }
    } else {
      subscription = await changePaddleSubscriptionPrice(config, subscriptionId, proPrice, { trialing: false });
    }
  } catch (error) {
    logger.error("Couldn't upgrade the subscription to Pro.", error, { businessId, path: path.kind });
    return { ok: false, error: UPGRADE_FAILED };
  }

  // Paddle has charged: from here a failure is bookkeeping the webhook repeats,
  // never "didn't go through".
  try {
    await applySubscriptionSnapshot(config, subscription, subscriptionChangedAt(subscription, new Date()));
    if (business.proTrialEndsAt && business.proTrialEndsAt > new Date()) {
      await prisma.business.update({ where: { id: businessId }, data: { proTrialEndsAt: new Date() } });
    }
  } catch (error) {
    logger.error("Couldn't record a paid Pro upgrade; the webhook will.", error, { businessId });
  }

  // The plan, Pro features and the banner render on every workspace page.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * After a failed trial activation, puts the item back on Basic's trial price,
 * but only while Paddle still says the trial runs: an activation that timed out
 * on our side may have charged, and must not be undone.
 */
async function restoreBasicTrial(config: PaddleConfig, subscriptionId: string, basicTrialPrice: string, businessId: string) {
  try {
    if ((await getPaddleSubscription(config, subscriptionId)).status !== "trialing") return;
    await changePaddleSubscriptionPrice(config, subscriptionId, basicTrialPrice, { trialing: true });
  } catch (error) {
    logger.error("Couldn't put a trial back on Basic after a failed upgrade.", error, { businessId });
  }
}

/** Ends the Pro trial early and goes back to Basic; nothing changes in billing. */
export async function endProTrialAction(): Promise<BillingActionResult> {
  const context = await getAuthedBusiness(SESSION_EXPIRED, { access: "read" });
  if ("error" in context) return { ok: false, error: context.error };
  const { business } = context;
  if (proTrialState(business).kind !== "active") return { ok: false, error: "Your Pro trial has already ended." };
  await prisma.business.update({
    where: { id: business.id },
    data: { plan: business.subscribedPlan ?? "BASIC", proTrialEndsAt: new Date() },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
