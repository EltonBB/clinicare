import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import {
  BAILEYS_BRIDGE_HEADER,
  type WorkerInboundEvent,
} from "@/lib/messaging/baileys-contract";
import {
  recordDeliveryStatus,
  recordInboundMessage,
} from "@/lib/messaging/inbound";

export const dynamic = "force-dynamic";

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

  let event: WorkerInboundEvent;
  try {
    event = (await request.json()) as WorkerInboundEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (!event || typeof event !== "object" || !event.businessId) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

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
