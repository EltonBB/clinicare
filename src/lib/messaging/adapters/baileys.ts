import { z } from "zod";

import {
  BAILEYS_BRIDGE_HEADER,
  WORKER_SEND_KEY_CONFLICT_STATUS,
  WORKER_SEND_OUTCOME_UNKNOWN_STATUS,
  type WorkerSendRequest,
  type WorkerSendResponse,
} from "../baileys-contract";
import {
  SendOutcomeUnknownError,
  type AdapterSendInput,
  type AdapterSendResult,
  type ChannelAdapter,
  type MessageChannel,
  type MessageDeliveryStatus,
} from "../types";

/** Runtime guard for the worker's /send reply — a malformed 200 must not be
 * trusted as a real send. */
const workerSendResponseSchema = z.object({
  providerMessageId: z.string().nullable(),
  status: z.enum(["QUEUED", "SENT", "FAILED"]),
});

// Bound the worker round-trip so a stalled worker/proxy can't hang an Inbox send
// or block the reminder cron's concurrency pool. Sits above the worker's own 20s
// socket-send timeout so the worker's own answer wins the race; an app-side
// timeout aborts and surfaces as an uncertain send (the worker may have sent).
const WORKER_SEND_TIMEOUT_MS = 25_000;

// fetch failures where the TCP connection was never made (refused, no DNS
// answer, connect timeout) — the only network errors that prove nothing left.
const CONNECT_FAILURE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function isConnectFailure(error: unknown): boolean {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" && CONNECT_FAILURE_CODES.has(code);
}

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
      // A worker from before keys existed simply ignores the field.
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    };

    let response: Response;
    try {
      response = await fetch(
        `${this.config.workerUrl.replace(/\/$/, "")}/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [BAILEYS_BRIDGE_HEADER]: this.config.secret,
          },
          body: JSON.stringify(payload),
          cache: "no-store",
          // Abort a stalled worker — never surfaced upward as-is.
          signal: AbortSignal.timeout(WORKER_SEND_TIMEOUT_MS),
        }
      );
    } catch (error) {
      // No connection was ever made: nothing can have been sent.
      if (isConnectFailure(error)) {
        throw new Error("WhatsApp worker is unreachable.", { cause: error });
      }
      // An abort or a dropped connection after the request went out: the worker
      // may have sent the message and only its answer was lost.
      throw new SendOutcomeUnknownError("WhatsApp worker didn't answer the send.", { cause: error });
    }

    if (!response.ok) {
      // 409: the worker's own "may have left" answer. 422: this key already
      // carried a message that was sent or may have been (a failed one is never
      // remembered), so sending this one too would deliver it twice. 504: a
      // proxy gave up waiting on a worker that had the request.
      if (
        response.status === WORKER_SEND_OUTCOME_UNKNOWN_STATUS ||
        response.status === WORKER_SEND_KEY_CONFLICT_STATUS ||
        response.status === 504
      ) {
        throw new SendOutcomeUnknownError(
          `WhatsApp worker couldn't confirm the send (status ${response.status}).`
        );
      }
      // Generic by design — never surface worker/provider internals upward.
      // Every other refusal (400/401/502, or a proxy with no worker behind it)
      // means nothing was sent.
      throw new Error(
        `WhatsApp worker rejected the send (status ${response.status}).`
      );
    }

    const raw: unknown = await response.json().catch(() => null);
    const parsed = workerSendResponseSchema.safeParse(raw);
    if (!parsed.success) {
      // A malformed 200 (proxy error page, shape drift, a body cut off midway)
      // must not be recorded as a phantom "sent" message — but the worker only
      // answers 200 after sending, so it isn't safe to retry either.
      throw new SendOutcomeUnknownError("WhatsApp worker returned an unexpected response.");
    }
    return {
      providerMessageId: parsed.data.providerMessageId,
      status: mapWorkerStatus(parsed.data.status),
    };
  }
}
