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
    readonly code: string | null
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
  const json = (await response.json().catch(() => null)) as { data?: T; error?: { code?: string } } | null;
  if (!response.ok || !json || json.data === undefined) {
    throw new PaddleApiError(response.status, json?.error?.code ?? null);
  }
  return json.data;
}

export function getPaddleSubscription(config: PaddleConfig, subscriptionId: string): Promise<PaddleSubscription> {
  return paddleRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" });
}

/**
 * Moves a subscription to another of this app's prices (plan or interval),
 * charging or crediting the difference now (immediate, prorated). During a
 * trial Paddle keeps the trial end; nothing is charged before it.
 */
export function changePaddleSubscriptionPrice(
  config: PaddleConfig,
  subscriptionId: string,
  priceId: string
): Promise<PaddleSubscription> {
  return paddleRequest(config, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PATCH",
    body: {
      items: [{ price_id: priceId, quantity: 1 }],
      proration_billing_mode: "prorated_immediately",
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

/** A short-lived link to Paddle's customer portal: card, invoices, cancel. */
export async function createPaddlePortalUrl(
  config: PaddleConfig,
  customerId: string,
  subscriptionIds: string[]
): Promise<string> {
  const session = await paddleRequest<{ urls: { general: { overview: string } } }>(
    config,
    `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
    { method: "POST", body: { subscription_ids: subscriptionIds } }
  );
  return session.urls.general.overview;
}
