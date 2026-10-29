import type { PaddleConfig } from "./paddle-config";
import type { PaddleSubscription } from "./subscription-snapshot";

/**
 * The few Paddle Billing API calls the app makes, over raw fetch (no SDK:
 * CLAUDE.md keeps dependencies lean). Every call is time-boxed so a slow Paddle
 * can't hang a request or a cron run. Errors carry the HTTP status only, never
 * the response body (it can echo customer details).
 */
const PADDLE_TIMEOUT_MS = 10_000;

export class PaddleApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    /** The request fields Paddle rejected (e.g. "tax_identifier"), never their values. */
    readonly fields: string[] = []
  ) {
    super(`Paddle API request failed (${status}${code ? `, ${code}` : ""}).`);
    this.name = "PaddleApiError";
  }
}

async function paddleRequest<T>(config: PaddleConfig, path: string, init: { method: "GET" | "POST" | "PATCH"; body?: unknown }): Promise<T> {
  const response = await fetch(`${config.apiBase}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(PADDLE_TIMEOUT_MS),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; errors?: Array<{ field?: string }> };
  } | null;
  if (!response.ok || !json || json.data === undefined) {
    const fields = (json?.error?.errors ?? []).flatMap((item) => (item.field ? [item.field] : []));
    throw new PaddleApiError(response.status, json?.error?.code ?? null, fields);
  }
  return json.data;
}

export function getPaddleSubscription(config: PaddleConfig, subscriptionId: string): Promise<PaddleSubscription> {
  return paddleRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" });
}

/**
 * Moves a subscription to another of this app's prices (plan or interval),
 * charging or crediting the difference now (immediate, prorated). Paddle
 * refuses that during a trial and only accepts `do_not_bill`, which keeps the
 * trial end: nothing is charged before it, then the new price.
 */
export function changePaddleSubscriptionPrice(
  config: PaddleConfig,
  subscriptionId: string,
  priceId: string,
  { trialing }: { trialing: boolean }
): Promise<PaddleSubscription> {
  return paddleRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    body: {
      items: [{ price_id: priceId, quantity: 1 }],
      proration_billing_mode: trialing ? "do_not_bill" : "prorated_immediately",
    },
  });
}

/**
 * Cancels a subscription at once, before anything (more) is charged. Only for
 * one the app refuses to attach to a clinic (subscription-sync.ts).
 */
export function cancelPaddleSubscription(config: PaddleConfig, subscriptionId: string): Promise<PaddleSubscription> {
  return paddleRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    body: { effective_from: "immediately" },
  });
}

/**
 * Ends a subscription when its current period (or trial) runs out: the clinic
 * keeps everything until then. Undone by {@link resumePaddleSubscription}.
 */
export function schedulePaddleCancel(config: PaddleConfig, subscriptionId: string): Promise<PaddleSubscription> {
  return paddleRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    body: { effective_from: "next_billing_period" },
  });
}

/** Drops a scheduled cancellation, so the subscription renews as before. */
export function resumePaddleSubscription(config: PaddleConfig, subscriptionId: string): Promise<PaddleSubscription> {
  return paddleRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    body: { scheduled_change: null },
  });
}

/**
 * The transaction Paddle.js opens to replace a subscription's card (and, while
 * a payment is failing, to retry it with the new one).
 */
export async function getCardUpdateTransactionId(config: PaddleConfig, subscriptionId: string): Promise<string> {
  const transaction = await paddleRequest<{ id: string }>(
    config,
    `/subscriptions/${encodeURIComponent(subscriptionId)}/update-payment-method-transaction`,
    { method: "GET" }
  );
  return transaction.id;
}

/** The fields of a Paddle transaction the billing history reads. */
export type PaddleTransaction = {
  id: string;
  status: string;
  /** "web", "subscription_recurring", "subscription_update", "subscription_payment_method_change"… */
  origin: string;
  customer_id: string | null;
  billed_at: string | null;
  created_at: string;
  currency_code: string;
  details: { totals: { grand_total: string } };
  payments: Array<{
    status: string;
    method_details?: { type: string; card?: { type: string; last4: string; expiry_month: number; expiry_year: number } | null } | null;
  }>;
};

/** A customer's billed transactions (paid or failing), newest first. */
export function listPaddleTransactions(config: PaddleConfig, customerId: string): Promise<PaddleTransaction[]> {
  const query = new URLSearchParams({
    customer_id: customerId,
    status: "completed,past_due",
    order_by: "billed_at[DESC]",
    per_page: "24",
  });
  return paddleRequest(config, `/transactions?${query}`, { method: "GET" });
}

export function getPaddleTransaction(config: PaddleConfig, transactionId: string): Promise<PaddleTransaction> {
  return paddleRequest(config, `/transactions/${encodeURIComponent(transactionId)}`, { method: "GET" });
}

/** A short-lived link to a transaction's invoice PDF. */
export async function getPaddleInvoiceUrl(config: PaddleConfig, transactionId: string): Promise<string> {
  const invoice = await paddleRequest<{ url: string }>(
    config,
    `/transactions/${encodeURIComponent(transactionId)}/invoice`,
    { method: "GET" }
  );
  return invoice.url;
}

/** The billing address Paddle keeps for a subscription (the country sets the tax). */
export type PaddleAddress = {
  id: string;
  first_line: string | null;
  city: string | null;
  postal_code: string | null;
  country_code: string;
};

/** The company a subscription is billed to, when there is one: its name and VAT number print on invoices. */
export type PaddleBusiness = { id: string; name: string; tax_identifier: string | null };

function customerPath(customerId: string, rest: string): string {
  return `/customers/${encodeURIComponent(customerId)}/${rest}`;
}

export function getPaddleAddress(config: PaddleConfig, customerId: string, addressId: string): Promise<PaddleAddress> {
  return paddleRequest(config, customerPath(customerId, `addresses/${encodeURIComponent(addressId)}`), { method: "GET" });
}

export function updatePaddleAddress(
  config: PaddleConfig,
  customerId: string,
  addressId: string,
  fields: { first_line: string | null; city: string | null; postal_code: string | null }
): Promise<PaddleAddress> {
  return paddleRequest(config, customerPath(customerId, `addresses/${encodeURIComponent(addressId)}`), {
    method: "PATCH",
    body: fields,
  });
}

export function getPaddleBusiness(config: PaddleConfig, customerId: string, businessId: string): Promise<PaddleBusiness> {
  return paddleRequest(config, customerPath(customerId, `businesses/${encodeURIComponent(businessId)}`), { method: "GET" });
}

/** Creates the company, or renames it and sets its VAT number when `businessId` is given. */
export function savePaddleBusiness(
  config: PaddleConfig,
  customerId: string,
  businessId: string | null,
  fields: { name: string; tax_identifier: string | null }
): Promise<PaddleBusiness> {
  return businessId
    ? paddleRequest(config, customerPath(customerId, `businesses/${encodeURIComponent(businessId)}`), {
        method: "PATCH",
        body: fields,
      })
    : paddleRequest(config, customerPath(customerId, "businesses"), { method: "POST", body: fields });
}

/** Bills a subscription to a company from now on, or to the person again with `null`. */
export function setPaddleSubscriptionBusiness(
  config: PaddleConfig,
  subscriptionId: string,
  businessId: string | null
): Promise<PaddleSubscription> {
  return paddleRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    body: { business_id: businessId },
  });
}
