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
 * Syncs the app's stored WhatsApp connection state from a worker-pushed event.
 *
 * The worker holds the live socket; the app gates Inbox/reminder sends on the
 * stored `WhatsAppConnection.status`. Without this push, a successful pair (if
 * the Settings poll misses it) or a phone logout would leave the stored row
 * stale — showing "Connected" with no session, or never flipping to connected.
 */
export async function recordConnectionState(event: {
  businessId: string;
  status: "connected" | "disconnected";
}): Promise<void> {
  if (event.status === "connected") {
    // A live socket is confirmed — persist CONNECTED and enable reminders so the
    // clinic isn't dependent on the Settings poll catching the moment.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.whatsAppConnection.updateMany({
        where: { businessId: event.businessId },
        data: {
          provider: "BAILEYS",
          status: "CONNECTED",
          connectedAt: new Date(),
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
      // Only enable reminders when a connection row actually exists — never flip
      // whatsappEnabled for a business that has no WhatsApp link.
      if (updated.count > 0) {
        await tx.business.updateMany({
          where: { id: event.businessId },
          data: { whatsappEnabled: true },
        });
      }
    });
    return;
  }
  // The phone unlinked or the worker gave up reconnecting — reflect it so
  // Settings shows "not connected" and the reminder cron stops attempting sends
  // against a session that no longer exists.
  await prisma.whatsAppConnection.updateMany({
    where: { businessId: event.businessId },
    data: {
      status: "DISCONNECTED",
      connectedAt: null,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Applies an async delivery receipt (sent/delivered/read/failed) to a previously
 * stored outbound message, keyed on its provider message id. A no-op if the id
 * matches nothing.
 */
// Delivery receipts can arrive out of order or be re-pushed by the worker (a
// retried SENT after a READ, a stale FAILED). Only advance the stored status
// forward along QUEUED → SENT → DELIVERED → READ (and let FAILED win only from a
// pre-delivery state), so a late/duplicated receipt can't regress a message's
// status in the Inbox. The `deliveryStatus: { in: … }` predicate makes this an
// atomic compare-and-set — no read-modify-write race.
const DELIVERY_STATUS_ADVANCE_FROM: Record<
  MessageDeliveryStatus,
  MessageDeliveryStatus[]
> = {
  QUEUED: [],
  SENT: ["QUEUED"],
  DELIVERED: ["QUEUED", "SENT"],
  READ: ["QUEUED", "SENT", "DELIVERED"],
  FAILED: ["QUEUED", "SENT"],
};

export async function recordDeliveryStatus(event: {
  providerMessageId: string;
  status: MessageDeliveryStatus;
  errorCode?: string;
}): Promise<void> {
  if (!event.providerMessageId) {
    return;
  }
  const advanceFrom = DELIVERY_STATUS_ADVANCE_FROM[event.status];
  if (advanceFrom.length === 0) {
    return; // never regress a message back to QUEUED
  }
  await prisma.message.updateMany({
    where: {
      providerMessageSid: event.providerMessageId,
      deliveryStatus: { in: advanceFrom },
    },
    data: {
      deliveryStatus: event.status,
      deliveryErrorCode: event.errorCode || null,
      deliveryUpdatedAt: new Date(),
    },
  });
}
