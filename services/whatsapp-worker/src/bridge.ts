import { BRIDGE_HEADER, config } from "./config";
import { logger } from "./logger";

/**
 * Inbound events the worker forwards to the app. Mirrors WorkerInboundEvent in
 * the app's baileys-contract.ts — keep the two in sync.
 */
export type InboundEvent =
  | {
      type: "message";
      businessId: string;
      from: string;
      body: string;
      providerMessageId: string;
      contactName?: string;
    }
  | {
      type: "status";
      businessId: string;
      providerMessageId: string;
      status: "SENT" | "DELIVERED" | "READ" | "FAILED";
      errorCode?: string;
    };

const MAX_ATTEMPTS = 4;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST an inbound message / delivery receipt to the app webhook.
 *
 * Retries on a transient failure (network error or 5xx) with backoff so a
 * patient's reply isn't lost during an app deploy/outage — a 4xx (the app
 * rejecting the payload) won't fix itself, so we don't retry that. Never throws:
 * a persistent app outage must not crash the socket. Logs record ids only.
 */
export async function postToApp(event: InboundEvent): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(config.appWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [BRIDGE_HEADER]: config.bridgeSecret,
        },
        body: JSON.stringify(event),
      });
      if (response.ok) {
        return;
      }
      if (response.status >= 400 && response.status < 500) {
        logger.error(
          { status: response.status, businessId: event.businessId, type: event.type },
          "App webhook rejected event"
        );
        return;
      }
      logger.warn(
        { status: response.status, businessId: event.businessId, type: event.type, attempt },
        "App webhook 5xx — retrying"
      );
    } catch {
      logger.warn(
        { businessId: event.businessId, type: event.type, attempt },
        "App webhook unreachable — retrying"
      );
    }
    if (attempt < MAX_ATTEMPTS) {
      await delay(1000 * 2 ** (attempt - 1)); // 1s, 2s, 4s
    }
  }
  logger.error(
    { businessId: event.businessId, type: event.type },
    "App webhook failed after retries — event dropped"
  );
}
