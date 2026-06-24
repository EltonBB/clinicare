import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { BAILEYS_BRIDGE_HEADER } from "@/lib/messaging/baileys-contract";
import {
  recordDeliveryStatus,
  recordInboundMessage,
} from "@/lib/messaging/inbound";

export const dynamic = "force-dynamic";

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
]);

/**
 * Inbound endpoint for the isolated WhatsApp worker. Authenticated by a single
 * shared bridge secret (constant-time compared). The worker is trusted infra
 * inside our boundary, so it names the `businessId` directly — there's no
 * provider number-matching dance like the Twilio webhook needs.
 */
function isAuthorizedWorker(request: Request): boolean {
  const provided = request.headers.get(BAILEYS_BRIDGE_HEADER)?.trim();
  const expected = process.env.BAILEYS_BRIDGE_SECRET?.trim();
  if (!expected || !provided) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!isAuthorizedWorker(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
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

    if (event.type === "message") {
      const result = await recordInboundMessage({
        businessId: event.businessId,
        fromPhone: event.from,
        body: event.body,
        providerMessageId: event.providerMessageId,
        contactName: event.contactName,
      });
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
