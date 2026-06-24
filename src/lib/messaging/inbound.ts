import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";

import type { MessageDeliveryStatus } from "./types";

export type InboundMessage = {
  businessId: string;
  /** Sender MSISDN (digits, with or without "+"); canonicalized here. */
  fromPhone: string;
  body: string;
  providerMessageId: string | null;
  /** Provider-supplied display name, if any. */
  contactName?: string;
};

export type RecordInboundResult =
  | { recorded: true; conversationId: string }
  | { recorded: false; reason: "duplicate" | "invalid_phone" | "empty_body" };

/**
 * Provider-agnostic inbound handler.
 *
 * Threads an incoming message onto the right conversation (keyed on
 * `businessId` + `phoneKey`, so a reply always lands on the row a reminder
 * created), links a matching client by the canonical phone key, and stores the
 * message idempotently on `providerMessageId`.
 *
 * Used by the Baileys inbound webhook. (It was written to also serve the old
 * Twilio webhook, which has since been removed — Baileys is the only WhatsApp
 * provider now.)
 */
// Hard cap on a stored inbound body — bounds abuse from an oversized payload
// (well above any real WhatsApp text message).
const MAX_INBOUND_BODY = 8000;

export async function recordInboundMessage(
  event: InboundMessage
): Promise<RecordInboundResult> {
  const body = event.body.trim().slice(0, MAX_INBOUND_BODY);
  if (!body) {
    return { recorded: false, reason: "empty_body" };
  }

  const normalizedPhone = normalizePhone(event.fromPhone);
  const phoneKey = phoneLookupKey(event.fromPhone);
  if (phoneKey.replace(/\D/g, "").length < 6) {
    return { recorded: false, reason: "invalid_phone" };
  }

  // Idempotency: a worker retry must not duplicate a message or re-bump unread.
  if (event.providerMessageId) {
    const existing = await prisma.message.findFirst({
      where: { providerMessageSid: event.providerMessageId },
      select: { id: true },
    });
    if (existing) {
      return { recorded: false, reason: "duplicate" };
    }
  }

  const matchingClient = await prisma.client.findFirst({
    where: { businessId: event.businessId, phoneKey },
    select: { id: true, name: true },
  });

  const preferredName = event.contactName?.trim() || matchingClient?.name;

  let conversationId: string;
  try {
    conversationId = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: {
          businessId_phoneKey: { businessId: event.businessId, phoneKey },
        },
        update: {
          // Only overwrite the display name when we learned a better one.
          contactName: preferredName || undefined,
          unreadCount: { increment: 1 },
        },
        create: {
          businessId: event.businessId,
          phoneNumber: normalizedPhone,
          phoneKey,
          contactName: preferredName || normalizedPhone,
          unreadCount: 1,
        },
        select: { id: true },
      });

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          clientId: matchingClient?.id ?? null,
          direction: "INBOUND",
          body,
          providerMessageSid: event.providerMessageId || null,
        },
      });

      return conversation.id;
    });
  } catch (error) {
    // A worker retry can race the dedup check above and then collide on the
    // unique `providerMessageSid` here — treat that as an idempotent no-op so
    // the webhook returns ok and the worker stops retrying (instead of a 500
    // loop). The transaction rolls back, so no unread bump leaks.
    if (
      event.providerMessageId &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return { recorded: false, reason: "duplicate" };
    }
    throw error;
  }

  return { recorded: true, conversationId };
}

/**
 * Applies an async delivery receipt (sent/delivered/read/failed) to a previously
 * stored outbound message, keyed on its provider message id. A no-op if the id
 * matches nothing.
 */
export async function recordDeliveryStatus(event: {
  providerMessageId: string;
  status: MessageDeliveryStatus;
  errorCode?: string;
}): Promise<void> {
  if (!event.providerMessageId) {
    return;
  }
  await prisma.message.updateMany({
    where: { providerMessageSid: event.providerMessageId },
    data: {
      deliveryStatus: event.status,
      deliveryErrorCode: event.errorCode || null,
      deliveryUpdatedAt: new Date(),
    },
  });
}
