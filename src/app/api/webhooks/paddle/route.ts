import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { paddleConfig } from "@/lib/paddle/paddle-config";
import { PADDLE_SIGNATURE_HEADER, verifyPaddleSignature } from "@/lib/paddle/paddle-webhook";
import type { PaddleSubscription } from "@/lib/paddle/subscription-snapshot";
import { applySubscriptionSnapshot } from "@/lib/paddle/subscription-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paddle's events are a few KB; anything far larger isn't one of them.
const MAX_BODY_BYTES = 256 * 1024;

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: unknown;
};

function isSubscription(data: unknown): data is PaddleSubscription {
  const candidate = data as Partial<PaddleSubscription> | null;
  return (
    !!candidate &&
    typeof candidate.id === "string" &&
    typeof candidate.status === "string" &&
    typeof candidate.customer_id === "string" &&
    Array.isArray(candidate.items)
  );
}

/**
 * Paddle → app: subscription events, signed with the destination's secret.
 * Every `subscription.*` event carries the whole subscription, so each one is
 * applied as a snapshot (subscription-sync.ts guards order). Answers 200 for
 * anything handled or deliberately ignored (so Paddle stops retrying), 401 for
 * a bad signature, 500 when the write failed (so Paddle retries it).
 */
export async function POST(request: Request) {
  const config = paddleConfig();
  if (!config) {
    return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const signature = verifyPaddleSignature({
    header: request.headers.get(PADDLE_SIGNATURE_HEADER),
    rawBody,
    secret: config.webhookSecret,
  });
  if (!signature.ok) {
    logger.warn("Paddle webhook refused.", { reason: signature.reason });
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: PaddleEvent;
  try {
    event = JSON.parse(rawBody) as PaddleEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!event.event_type?.startsWith("subscription.")) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const occurredAt = event.occurred_at ? new Date(event.occurred_at) : null;
  if (!occurredAt || Number.isNaN(occurredAt.getTime()) || !isSubscription(event.data)) {
    logger.warn("Paddle subscription event is missing fields.", { eventId: event.event_id ?? null });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const outcome = await applySubscriptionSnapshot(config, event.data, occurredAt);
    if (outcome === "applied") {
      // Plan, banner and access render on every workspace page.
      revalidatePath("/", "layout");
    }
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    logger.error("Paddle subscription event failed to apply.", error, {
      eventId: event.event_id ?? null,
      subscriptionId: event.data.id,
    });
    return NextResponse.json({ error: "Could not apply the event." }, { status: 500 });
  }
}
