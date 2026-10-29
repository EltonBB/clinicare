"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { USABLE_SUBSCRIPTION_STATUSES } from "@/lib/billing-access";
import { getAuthedBusiness } from "@/lib/business";
import { logger } from "@/lib/logger";
import { changePaddleSubscriptionPrice, createPaddlePortalUrl } from "@/lib/paddle/paddle-api";
import { paddleConfig } from "@/lib/paddle/paddle-config";
import { subscriptionChangedAt } from "@/lib/paddle/subscription-snapshot";
import { applySubscriptionSnapshot } from "@/lib/paddle/subscription-sync";

const SESSION_EXPIRED = "Your session expired. Log in again to manage billing.";
const BILLING_UNAVAILABLE = "Billing isn't available right now. Please try again later.";

export type BillingActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * A short-lived link to the billing portal (card, invoices, cancel). Works for
 * a read-only workspace too: billing is how a clinic gets unlocked, and an
 * ended plan's invoices stay reachable.
 */
export async function openBillingPortalAction(): Promise<BillingActionResult<{ url: string }>> {
  const context = await getAuthedBusiness(SESSION_EXPIRED, { access: "read" });
  if ("error" in context) return { ok: false, error: context.error };
  const config = paddleConfig();
  const { business } = context;
  if (!config || !business.paddleCustomerId) return { ok: false, error: BILLING_UNAVAILABLE };

  try {
    const url = await createPaddlePortalUrl(
      config,
      business.paddleCustomerId,
      business.paddleSubscriptionId ? [business.paddleSubscriptionId] : []
    );
    return { ok: true, url };
  } catch (error) {
    logger.error("Couldn't open the billing portal.", error, { businessId: business.id });
    return { ok: false, error: BILLING_UNAVAILABLE };
  }
}

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
    return { ok: false, error: "Your plan is set to end. Resume it from Manage billing first." };
  }
  if (business.subscriptionStatus === "PAST_DUE") {
    return { ok: false, error: "Your last payment didn't go through. Update your card in Manage billing first." };
  }

  // Keep the trial: a trialing subscription moves to the new plan's trial price.
  const pair = config.prices[parsed.data.plan][parsed.data.interval];
  const priceId = business.subscriptionStatus === "TRIALING" ? pair.trial : pair.noTrial;

  try {
    const subscription = await changePaddleSubscriptionPrice(config, business.paddleSubscriptionId, priceId);
    await applySubscriptionSnapshot(config, subscription, subscriptionChangedAt(subscription, new Date()));
  } catch (error) {
    logger.error("Couldn't change the subscription's plan.", error, { businessId: business.id });
    return { ok: false, error: "We couldn't change your plan. Please try again." };
  }

  // Plan name, Pro features and the banner render on every workspace page.
  revalidatePath("/", "layout");
  return { ok: true };
}
