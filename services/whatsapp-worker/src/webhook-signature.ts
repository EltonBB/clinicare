import { createHmac } from "node:crypto";

/**
 * Signs the worker -> app webhook. Mirrors `src/lib/messaging/webhook-signature.ts`
 * in the app (which also verifies); the two must stay byte-for-byte compatible.
 *
 * `v1=` + hex HMAC-SHA256 of `${timestampSeconds}.${rawBody}`, keyed with
 * APP_WEBHOOK_SECRET (the app's BAILEYS_WEBHOOK_SECRET) — a different secret from
 * the app -> worker bridge secret, so leaking either one alone can't forge the other direction.
 */
export const WEBHOOK_TIMESTAMP_HEADER = "x-vela-webhook-timestamp";
export const WEBHOOK_SIGNATURE_HEADER = "x-vela-webhook-signature";

export function signWebhookBody(secret: string, timestampSeconds: number, rawBody: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex")}`;
}
