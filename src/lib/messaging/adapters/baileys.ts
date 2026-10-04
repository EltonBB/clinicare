import { z } from "zod";

import {
  BAILEYS_BRIDGE_HEADER,
  WORKER_SEND_FAILED_CODE,
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
// timeout aborts, and the send's answer is then lost (see answerLost below).
const WORKER_SEND_TIMEOUT_MS = 25_000;

// fetch failures before a single request byte reached the worker — no route,
// no DNS answer, a refused or timed-out connect, a TLS handshake or certificate
// failure — the only network errors that prove nothing left (Codex #133).
const CONNECT_FAILURE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
  "EHOSTDOWN",
  "EADDRNOTAVAIL",
  "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REVOKED",
  "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function isConnectFailure(error: unknown): boolean {
  // fetch wraps the socket error ("fetch failed" -> cause), sometimes twice.
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && (CONNECT_FAILURE_CODES.has(code) || code.startsWith("ERR_SSL_"))) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
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

    // The request may have reached the worker but its answer was lost or
    // garbled on the way back (an abort, a dropped connection, a proxy's own
    // 5xx, a malformed 200). A keyed send is safe to retry: the worker keeps a
    // durable record of every key and answers a repeat from it — replayed if it
    // went out, "unknown" if it may have — so this is a plain, retryable
    // failure. An unkeyed send (an Inbox reply) has no such record, so it is
    // reported as possibly delivered (Codex #133).
    const answerLost = (message: string, cause?: unknown): Error =>
      input.idempotencyKey
        ? new Error(`${message} A retry with the same key is answered from the worker's record.`, { cause })
        : new SendOutcomeUnknownError(message, { cause });

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
      // An abort or a dropped connection after the request went out.
      throw answerLost("WhatsApp worker didn't answer the send.", error);
    }

    if (!response.ok) {
      // 409: the worker's own "may have left" answer. 422: this key already
      // carried a message that was sent or may have been (a failed one is never
      // kept), so sending this one too would deliver it twice.
      if (
        response.status === WORKER_SEND_OUTCOME_UNKNOWN_STATUS ||
        response.status === WORKER_SEND_KEY_CONFLICT_STATUS
      ) {
        throw new SendOutcomeUnknownError(
          `WhatsApp worker couldn't confirm the send (status ${response.status}).`
        );
      }
      // A 5xx is the worker's own "nothing was sent" only when it says so; from
      // a proxy (the hosting edge after the worker died mid-request, a gateway
      // timeout) it proves nothing about the message.
      if (response.status >= 500) {
        const refusal: unknown = await response.json().catch(() => null);
        if ((refusal as { code?: unknown } | null)?.code !== WORKER_SEND_FAILED_CODE) {
          throw answerLost(`WhatsApp worker's answer was lost (status ${response.status}).`);
        }
      }
      // Generic by design — never surface worker/provider internals upward.
      // The worker's own refusals (400/401, its coded 502) mean nothing was sent.
      throw new Error(
        `WhatsApp worker rejected the send (status ${response.status}).`
      );
    }

    const raw: unknown = await response.json().catch(() => null);
    const parsed = workerSendResponseSchema.safeParse(raw);
    if (!parsed.success) {
      // A malformed 200 (proxy error page, shape drift, a body cut off midway)
      // must not be recorded as a phantom "sent" message — but the worker only
      // answers 200 after sending, so the answer itself was lost.
      throw answerLost("WhatsApp worker returned an unexpected response.");
    }
    return {
      providerMessageId: parsed.data.providerMessageId,
      status: mapWorkerStatus(parsed.data.status),
    };
  }
}
