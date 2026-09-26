import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed worker -> app requests.
 *
 * The WhatsApp worker names the `businessId` of every inbound event it posts, so
 * whoever can forge one can inject a patient's reply (including "2 = cancel my
 * appointment"). A single secret shared with the app -> worker direction made a
 * leak of that one string enough. Inbound events therefore carry their own
 * secret and an HMAC over the exact body plus a timestamp: a captured request
 * can't be re-dated or altered, and a stale one is refused.
 *
 * `services/whatsapp-worker/src/webhook-signature.ts` is the worker's copy of the
 * signing half; keep the two byte-for-byte compatible (an interop test enforces it).
 */
export const WEBHOOK_TIMESTAMP_HEADER = "x-vela-webhook-timestamp";
export const WEBHOOK_SIGNATURE_HEADER = "x-vela-webhook-signature";

/** How far a request's timestamp may sit from now, either way (clock skew + retry backoff). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/i;
const TIMESTAMP_PATTERN = /^\d{1,12}$/;

/** `v1=` + hex HMAC-SHA256 of `${timestampSeconds}.${rawBody}`. */
export function signWebhookBody(secret: string, timestampSeconds: number, rawBody: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex")}`;
}

export type WebhookVerification =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

export function verifyWebhookSignature(args: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  /** Injectable clock for tests. */
  nowMs?: number;
}): WebhookVerification {
  const { secret, timestamp, signature, rawBody } = args;

  if (!timestamp || !signature) {
    return { ok: false, reason: "missing" };
  }

  // Strict digits only: `Number("1e9")`, `Number("0x10")` and friends would otherwise parse.
  if (!TIMESTAMP_PATTERN.test(timestamp)) {
    return { ok: false, reason: "malformed" };
  }

  const provided = SIGNATURE_PATTERN.exec(signature);

  if (!provided) {
    return { ok: false, reason: "malformed" };
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor((args.nowMs ?? Date.now()) / 1000);

  if (Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const expected = Buffer.from(signWebhookBody(secret, timestampSeconds, rawBody).slice(3), "hex");
  const actual = Buffer.from(provided[1], "hex");

  // Both are 32 bytes (the pattern guarantees the provided length), as timingSafeEqual requires.
  return timingSafeEqual(expected, actual) ? { ok: true } : { ok: false, reason: "mismatch" };
}
