import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { BAILEYS_BRIDGE_HEADER } from "@/lib/messaging/baileys-contract";
import {
  applyInboundReplyIntent,
  recordConnectionState,
  recordDeliveryStatus,
  recordInboundMessage,
} from "@/lib/messaging/inbound";
import {
  checkSignatureHeaders,
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "@/lib/messaging/webhook-signature";

export const dynamic = "force-dynamic";

function hasSharedBridgeSecret(request: Request): boolean {
  const provided = request.headers.get(BAILEYS_BRIDGE_HEADER)?.trim();
  const expected = process.env.BAILEYS_BRIDGE_SECRET?.trim();
  if (!expected || !provided) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Validate the worker's payload at the boundary. A malformed event is a
// terminal 400 (don't 500 → the worker would retry-loop forever). Field lengths
// are capped to bound abuse from an oversized payload.
const workerInboundEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    businessId: z.string().min(1).max(64),
    from: z.string().min(1).max(32),
    body: z.string().max(8000),
    providerMessageId: z.string().max(128),
    contactName: z.string().max(256).optional(),
  }),
  z.object({
    type: z.literal("status"),
    businessId: z.string().min(1).max(64),
    providerMessageId: z.string().min(1).max(128),
    status: z.enum(["SENT", "DELIVERED", "READ", "FAILED"]),
    errorCode: z.string().max(64).optional(),
  }),
  z.object({
    type: z.literal("connection"),
    businessId: z.string().min(1).max(64),
    status: z.enum(["connected", "disconnected"]),
  }),
]);

// A real worker event is a few hundred bytes (the body field alone is capped at
// 8000 chars). Anything far beyond that is refused before it is hashed, and the
// body is read as a stream that is cancelled the moment it passes this cap, so a
// caller can't make the endpoint buffer an arbitrarily large request.
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

let warnedAboutSharedSecretAuth = false;

function unauthorized(reason: string) {
  // Reason only — never the headers, the body or a secret.
  logger.warn("Rejected an inbound WhatsApp webhook.", { reason });
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function payloadTooLarge() {
  return NextResponse.json({ error: "Payload too large." }, { status: 413 });
}

function declaredLength(request: Request): number {
  return Number(request.headers.get("content-length") ?? 0);
}

/**
 * The request body as text, or null when it exceeds `maxBytes`. Content-Length
 * is only a hint a caller controls (it can be absent or false), so the bytes are
 * counted as they arrive and the stream is cancelled at the cap instead of being
 * buffered whole first.
 */
async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    received += value.byteLength;

    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Inbound endpoint for the isolated WhatsApp worker. The worker is trusted infra
 * inside our boundary, so it names the `businessId` directly — there's no
 * provider number-matching dance like the Twilio webhook needs. That makes the
 * authentication what stands between the internet and "a patient replied 2":
 *
 * - With BAILEYS_WEBHOOK_SECRET set, every request must carry an HMAC of its
 *   exact body and a fresh timestamp (see lib/messaging/webhook-signature.ts),
 *   keyed with a secret that only guards this direction. The shared bridge
 *   secret is then worth nothing here.
 * - Without it, the endpoint falls back to the shared bridge secret so an
 *   existing deployment keeps working until the worker is updated and the new
 *   secret is set on both sides (a warning says so, once per process).
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.BAILEYS_WEBHOOK_SECRET?.trim();
  const timestamp = request.headers.get(WEBHOOK_TIMESTAMP_HEADER);
  const signature = request.headers.get(WEBHOOK_SIGNATURE_HEADER);

  // Refuse what can be refused from the headers alone, before reading the body:
  // missing, malformed or stale signature metadata never gets its body buffered.
  if (webhookSecret) {
    const headerCheck = checkSignatureHeaders({ timestamp, signature });

    if (!headerCheck.ok) {
      return unauthorized(headerCheck.reason);
    }
  } else {
    if (!hasSharedBridgeSecret(request)) {
      return unauthorized("shared-secret");
    }

    if (!warnedAboutSharedSecretAuth) {
      warnedAboutSharedSecretAuth = true;
      logger.warn(
        "Inbound WhatsApp events are authenticated with the shared bridge secret only. Set BAILEYS_WEBHOOK_SECRET here and APP_WEBHOOK_SECRET on the worker to require signed requests."
      );
    }
  }

  if (declaredLength(request) > MAX_WEBHOOK_BODY_BYTES) {
    return payloadTooLarge();
  }

  const rawBody = await readBodyWithLimit(request, MAX_WEBHOOK_BODY_BYTES);

  if (rawBody === null) {
    return payloadTooLarge();
  }

  if (webhookSecret) {
    const verification = verifyWebhookSignature({ secret: webhookSecret, timestamp, signature, rawBody });

    if (!verification.ok) {
      return unauthorized(verification.reason);
    }
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const parsed = workerInboundEventSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  const event = parsed.data;

  try {
    if (event.type === "status") {
      await recordDeliveryStatus({
        providerMessageId: event.providerMessageId,
        status: event.status,
        errorCode: event.errorCode,
      });
      return NextResponse.json({ ok: true });
    }

    if (event.type === "connection") {
      await recordConnectionState({
        businessId: event.businessId,
        status: event.status,
      });
      return NextResponse.json({ ok: true });
    }

    if (event.type === "message") {
      const result = await recordInboundMessage({
        businessId: event.businessId,
        fromPhone: event.from,
        body: event.body,
        providerMessageId: event.providerMessageId,
        contactName: event.contactName,
      });
      // Attempted whenever a client resolved — on a first-time recording AND
      // on a worker-retried duplicate — because a transient failure on an
      // earlier delivery can leave the message recorded but the reply intent
      // never applied; previously that failure was swallowed to ok:true, and
      // duplicate-detection meant no later retry ever got a second chance
      // (Codex #130). Left unwrapped (not caught here): a genuine failure now
      // falls through to the outer catch below and returns a 5xx, so the
      // worker actually retries the delivery instead of the reply intent
      // being silently lost. messageId is what keeps that retry itself safe:
      // applyInboundReplyIntent claims the message before acting, so a redelivery
      // of one it already handled (the worker also retries a lost-in-transit 200,
      // or one that took over 10s, not only a real failure) skips it instead of
      // sending the patient a second "you're confirmed".
      const clientId = result.recorded ? result.clientId : result.reason === "duplicate" ? result.clientId : null;
      const messageId = result.recorded ? result.messageId : result.reason === "duplicate" ? result.messageId : null;
      // No messageId means there is no row to claim (a raced duplicate whose winner
      // could not be found again), and running without a claim is exactly how a
      // reply gets sent twice - so skip; the message is recorded and in the Inbox.
      // Same for a message with no provider id: the worker sends "" when
      // Baileys omits one, recordInboundMessage can't dedupe it, and so a worker
      // retry would record it again under a NEW messageId and the claim above
      // wouldn't stop the reply going out twice (Codex #130).
      if (event.providerMessageId && messageId && (result.recorded || clientId)) {
        await applyInboundReplyIntent({
          businessId: event.businessId,
          clientId,
          body: event.body,
          messageId,
        });
      }
      return NextResponse.json({ ok: true, recorded: result.recorded });
    }
  } catch (error) {
    // Record-id-only, provider-neutral: never log message bodies or PHI.
    logger.error("Baileys inbound webhook failed.", error, {
      businessId: event.businessId,
      type: event.type,
    });
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }

  return NextResponse.json({ error: "Unknown event type." }, { status: 400 });
}
