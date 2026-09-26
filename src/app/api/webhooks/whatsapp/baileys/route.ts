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
// 8000 chars). Anything far beyond that is refused before it is read or hashed.
const MAX_WEBHOOK_BODY_CHARS = 64 * 1024;

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

  // Refuse what can be refused from the headers alone, before reading the body.
  if (webhookSecret) {
    if (!timestamp || !signature) {
      return unauthorized("missing");
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

  if (declaredLength(request) > MAX_WEBHOOK_BODY_CHARS) {
    return payloadTooLarge();
  }

  const rawBody = await request.text();

  if (rawBody.length > MAX_WEBHOOK_BODY_CHARS) {
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
      if (result.recorded) {
        // Best-effort: the message is already safely recorded above regardless
        // of whether a confirm/cancel reply can also be applied, so a failure
        // here must never turn a successful recordInboundMessage into a 500 —
        // the worker would retry, and duplicate-detection would then swallow
        // the retry as "duplicate", permanently losing the reply-intent chance.
        try {
          await applyInboundReplyIntent({
            businessId: event.businessId,
            clientId: result.clientId,
            body: event.body,
          });
        } catch (error) {
          logger.error("Failed to apply an inbound reply intent.", error, {
            businessId: event.businessId,
          });
        }
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
