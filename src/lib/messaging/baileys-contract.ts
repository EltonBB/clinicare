/**
 * The wire contract between the Next.js app and the isolated WhatsApp worker.
 *
 * The worker holds the 24/7 Baileys socket (it cannot live on Vercel); the app
 * reaches it over HTTP. Both directions authenticate with a single shared
 * secret carried in {@link BAILEYS_BRIDGE_HEADER} and compared in constant time.
 * These types are the single source of truth for that bridge — the worker
 * mirrors them.
 *
 * Provider/internal detail never crosses this boundary in a customer-visible
 * form: the worker returns neutral statuses, and the app maps them to our own
 * delivery-status vocabulary.
 */

/** Header carrying the shared bridge secret in both directions. */
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

/** app → worker: POST {workerUrl}/send */
export type WorkerSendRequest = {
  businessId: string;
  /** Digits-only E.164, no "+" (Baileys JID form), e.g. "38344123456". */
  to: string;
  body: string;
};

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
