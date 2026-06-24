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

/**
 * POST an inbound message / delivery receipt to the app webhook. Best-effort:
 * a transient app outage must not crash the socket, so failures are logged
 * (record ids only) and swallowed.
 */
export async function postToApp(event: InboundEvent): Promise<void> {
  try {
    const response = await fetch(config.appWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [BRIDGE_HEADER]: config.bridgeSecret,
      },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      logger.error(
        { status: response.status, businessId: event.businessId, type: event.type },
        "App webhook rejected event"
      );
    }
  } catch {
    logger.error(
      { businessId: event.businessId, type: event.type },
      "Failed to reach app webhook"
    );
  }
}
