import { z } from "zod";

import {
  BAILEYS_BRIDGE_HEADER,
  type WorkerSendRequest,
  type WorkerSendResponse,
} from "../baileys-contract";
import type {
  AdapterSendInput,
  AdapterSendResult,
  ChannelAdapter,
  MessageChannel,
  MessageDeliveryStatus,
} from "../types";

/** Runtime guard for the worker's /send reply — a malformed 200 must not be
 * trusted as a real send. */
const workerSendResponseSchema = z.object({
  providerMessageId: z.string().nullable(),
  status: z.enum(["QUEUED", "SENT", "FAILED"]),
});

function mapWorkerStatus(
  status: WorkerSendResponse["status"]
): MessageDeliveryStatus {
  switch (status) {
    case "SENT":
      return "SENT";
    case "FAILED":
      return "FAILED";
    case "QUEUED":
    default:
      return "QUEUED";
  }
}

/**
 * WhatsApp adapter backed by the isolated Baileys worker. This is a thin HTTP
 * client — the actual Baileys socket lives in the worker, never in the app — so
 * the provider stays confined behind the messaging seam.
 *
 * Pilot scope: Baileys is the Kosovo-only, non-PHI WhatsApp channel. Templates
 * (a Twilio/WABA concept) don't apply here; a linked WhatsApp always accepts
 * freeform text, so the adapter rejects an empty body rather than sending one.
 */
export class BaileysWhatsAppAdapter implements ChannelAdapter {
  readonly channel: MessageChannel = "WHATSAPP";

  constructor(
    private readonly config: { workerUrl: string; secret: string }
  ) {}

  async send(input: AdapterSendInput): Promise<AdapterSendResult> {
    // Baileys JIDs use a digits-only E.164 local part (no "+"). Strip every
    // non-digit so messy input can never reach the socket as a malformed JID.
    const to = input.to.replace(/\D/g, "");
    if (to.length < 6) {
      throw new Error("Baileys adapter received an unusable recipient.");
    }

    const body = input.body.trim();
    if (!body) {
      throw new Error("Baileys adapter requires a non-empty message body.");
    }

    const payload: WorkerSendRequest = {
      businessId: input.businessId,
      to,
      body,
    };

    const response = await fetch(
      `${this.config.workerUrl.replace(/\/$/, "")}/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [BAILEYS_BRIDGE_HEADER]: this.config.secret,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      // Generic by design — never surface worker/provider internals upward.
      throw new Error(
        `WhatsApp worker rejected the send (status ${response.status}).`
      );
    }

    const raw: unknown = await response.json().catch(() => null);
    const parsed = workerSendResponseSchema.safeParse(raw);
    if (!parsed.success) {
      // A malformed 200 (proxy error page, shape drift) must not be recorded as
      // a phantom "sent" message — treat it as a failure the dispatcher maps to
      // a generic, retryable error.
      throw new Error("WhatsApp worker returned an unexpected response.");
    }
    return {
      providerMessageId: parsed.data.providerMessageId,
      status: mapWorkerStatus(parsed.data.status),
    };
  }
}
