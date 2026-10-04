/**
 * The wire contract between the Next.js app and the isolated WhatsApp worker.
 *
 * The worker holds the 24/7 Baileys socket (it cannot live on Vercel); the app
 * reaches it over HTTP. app -> worker authenticates with the bridge secret
 * carried in {@link BAILEYS_BRIDGE_HEADER} (compared in constant time).
 * worker -> app events are signed with a separate secret instead (HMAC over the
 * body plus a timestamp — see webhook-signature.ts), so leaking one secret can't
 * forge the other direction. These types are the single source of truth for that
 * bridge — the worker mirrors them.
 *
 * Provider/internal detail never crosses this boundary in a customer-visible
 * form: the worker returns neutral statuses, and the app maps them to our own
 * delivery-status vocabulary.
 */

/** Header carrying the bridge secret on app -> worker requests (and, until a deployment adopts signed webhooks, worker -> app). */
export const BAILEYS_BRIDGE_HEADER = "x-vela-bridge-secret";

/** app → worker: POST {workerUrl}/pair */
export type WorkerPairRequest = {
  businessId: string;
  /**
   * Force a fresh pairing — drop the existing session + creds and emit a new QR
   * even if already connected ("link a different device"). Omitted/false reuses
   * a live session.
   */
  force?: boolean;
};

/**
 * app → worker: POST {workerUrl}/send
 *
 * Answers: 200 {@link WorkerSendResponse} (sent, or a replay of an earlier send
 * with the same key); 409 {@link WORKER_SEND_OUTCOME_UNKNOWN_STATUS} — the send
 * failed in a way that may follow the write (a timeout, a transport error), or
 * the worker stopped mid-send, so the message may have left,
 * and every repeat of the key is answered the same way, never re-sent; 422
 * {@link WORKER_SEND_KEY_CONFLICT_STATUS} — the key already carried a different
 * message that was sent or may have been (this one is not sent); 400, or 502
 * with code {@link WORKER_SEND_FAILED_CODE} — nothing sent, safe to retry. Any
 * other 5xx comes from something in between and proves nothing.
 * A worker from before keys existed ignores the key and answers an uncoded 502
 * for every failure, a timeout included.
 */
export type WorkerSendRequest = {
  businessId: string;
  /** Digits-only E.164, no "+" (Baileys JID form), e.g. "38344123456". */
  to: string;
  body: string;
  /**
   * One per logical message (IDEMPOTENCY_KEY_PATTERN in ./limits). The worker
   * keeps a record of it for a week, per workspace and in the database, so a
   * retry can't send the message twice. Omitted: no de-duplication.
   */
  idempotencyKey?: string;
};

/** The worker's answer when a send's outcome is unknown (it may have left). */
export const WORKER_SEND_OUTCOME_UNKNOWN_STATUS = 409;

/** The worker's answer when the key already carried a different message. */
export const WORKER_SEND_KEY_CONFLICT_STATUS = 422;

/** `code` in the worker's own 502 body: the send definitely did not go out. */
export const WORKER_SEND_FAILED_CODE = "send_failed";

export type WorkerSendResponse = {
  providerMessageId: string | null;
  status: "QUEUED" | "SENT" | "FAILED";
};

/** Connection state of a workspace's WhatsApp session, as the worker sees it. */
export type WorkerConnectionStatus =
  | "connecting"
  | "qr"
  | "connected"
  | "disconnected";

/** app → worker: GET {workerUrl}/status?businessId= and POST {workerUrl}/pair */
export type WorkerStatusResponse = {
  status: WorkerConnectionStatus;
  /** Present only while pairing (status === "qr"): the QR payload to render. */
  qr?: string;
};

/** worker → app: POST /api/webhooks/whatsapp/baileys */
export type WorkerInboundEvent =
  | {
      type: "message";
      businessId: string;
      /** Sender MSISDN (digits, with or without "+"); the app canonicalizes it. */
      from: string;
      body: string;
      providerMessageId: string;
      /** WhatsApp profile/display name, if the worker resolved one. */
      contactName?: string;
    }
  | {
      type: "status";
      businessId: string;
      providerMessageId: string;
      status: "SENT" | "DELIVERED" | "READ" | "FAILED";
      errorCode?: string;
    }
  | {
      // Connection-state change so the app's stored WhatsAppConnection.status
      // stays in sync with the worker (link state only — no patient data).
      type: "connection";
      businessId: string;
      status: "connected" | "disconnected";
    };
