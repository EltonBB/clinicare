import {
  cancelAppointmentCore,
  confirmAppointmentCore,
  notifyStaffOfAppointmentChange,
  revalidateCalendarSurfaces,
} from "@/lib/appointments-shared";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { sendMessage } from "@/lib/messaging";
import { prisma } from "@/lib/prisma";
import { classifyReplyIntent } from "@/lib/reply-intent";
import { liveSlotOfferWhere } from "@/lib/slot-offers";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";

import type { AppointmentStatus } from "@prisma/client";

import type { MessageDeliveryStatus, SendMessageResult } from "./types";

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
  | { recorded: true; conversationId: string; clientId: string | null; messageId: string }
  // "duplicate" still carries a resolved clientId (when the phone matches
  // exactly one client) and the existing row's messageId — a worker retry
  // means the message is already stored, but its reply-intent step is worth
  // re-attempting too, on the chance a transient failure applied the message
  // recording but not the reply intent the first time (Codex #130).
  // applyInboundReplyIntent claims the message (keyed off messageId) before
  // acting, which is what keeps that re-attempt from re-sending a reply the
  // first attempt already sent.
  | { recorded: false; reason: "duplicate"; clientId: string | null; messageId: string | null }
  | { recorded: false; reason: "invalid_phone" | "empty_body" };

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

  // `Client.phoneKey` is indexed but NOT unique — two different clients in the
  // same business can legitimately share one phone (e.g. a family). When more
  // than one matches, there is no confident single identity to link the
  // reply-intent workflow to, so `clientId` below is left `null` in that case
  // — same as the "no client matched at all" case — rather than silently
  // picking an arbitrary one of them (which could let a "2" reply cancel the
  // wrong family member's appointment). The message itself is still recorded
  // and threaded normally either way; only the identity used for reply-intent
  // matching becomes conservative. Resolved before the dedup check below (and
  // returned on the "duplicate" branch too) since it's a cheap read the
  // webhook route needs either way to retry the reply-intent step.
  const matchingClients = await prisma.client.findMany({
    where: { businessId: event.businessId, phoneKey },
    select: { id: true, name: true },
    take: 2,
  });
  const matchingClient = matchingClients.length === 1 ? matchingClients[0] : null;

  // Idempotency: a worker retry must not duplicate a message or re-bump unread.
  if (event.providerMessageId) {
    const existing = await prisma.message.findFirst({
      where: { providerMessageSid: event.providerMessageId },
      select: { id: true },
    });
    if (existing) {
      return { recorded: false, reason: "duplicate", clientId: matchingClient?.id ?? null, messageId: existing.id };
    }
  }

  const preferredName = event.contactName?.trim() || matchingClients[0]?.name;

  let conversationId: string;
  let messageId: string;
  try {
    ({ conversationId, messageId } = await prisma.$transaction(async (tx) => {
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

      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          clientId: matchingClient?.id ?? null,
          direction: "INBOUND",
          body,
          providerMessageSid: event.providerMessageId || null,
        },
        select: { id: true },
      });

      return { conversationId: conversation.id, messageId: message.id };
    }));
  } catch (error) {
    // A worker retry can race the dedup check above and then collide on the
    // unique `providerMessageSid` here — treat that as an idempotent no-op so
    // the webhook returns ok and the worker stops retrying (instead of a 500
    // loop). The transaction rolls back, so no unread bump leaks. Re-look up
    // the row the other request won, so the caller still gets its messageId.
    if (
      event.providerMessageId &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      const winner = await prisma.message.findFirst({
        where: { providerMessageSid: event.providerMessageId },
        select: { id: true },
      });
      // winner should always exist (that's what the P2002 collided on); null
      // only if it's somehow gone by the time we look again. applyInboundReplyIntent
      // treats a null/undefined messageId as "no claim to take", same as not
      // passing one at all — a safe fallback, not a silent bug.
      return { recorded: false, reason: "duplicate", clientId: matchingClient?.id ?? null, messageId: winner?.id ?? null };
    }
    throw error;
  }

  return { recorded: true, conversationId, clientId: matchingClient?.id ?? null, messageId };
}

export type ApplyReplyIntentResult =
  | {
      applied: false;
      reason: "no_intent" | "no_client" | "no_match" | "ambiguous" | "already_confirmed" | "open_offer" | "already_handled";
    }
  | { applied: true; intent: "confirm" | "cancel"; appointmentId: string };

/**
 * Mirrors an automatic confirm/cancel WhatsApp reply into the patient's Inbox
 * thread — same shape as reminders.ts's own best-effort inbox mirror and
 * inbox/actions.ts's sendInboxMessageAction: upsert the Conversation by its
 * (businessId, phoneKey) key, then create the OUTBOUND Message carrying the
 * provider id/delivery status, so a later delivery-status webhook
 * (recordDeliveryStatus, below) has a row to match against instead of
 * silently dropping the receipt. Best-effort: the confirm/cancel mutation
 * already succeeded by the time this runs, so a failure here must not fail
 * the overall reply-intent result — only the Inbox mirror is lost.
 */
async function mirrorOutboundReplyToInbox(args: {
  businessId: string;
  clientId: string;
  clientName: string | null;
  phone: string;
  result: Extract<SendMessageResult, { ok: true }>;
}) {
  const { businessId, clientId, clientName, phone, result } = args;
  const phoneKey = phoneLookupKey(phone);
  if (!phoneKey) {
    return;
  }
  const normalizedPhone = normalizePhone(phone);

  try {
    await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: {
          businessId_phoneKey: { businessId, phoneKey },
        },
        update: {
          contactName: clientName || undefined,
        },
        create: {
          businessId,
          phoneNumber: normalizedPhone,
          phoneKey,
          contactName: clientName || normalizedPhone,
          unreadCount: 0,
        },
        select: { id: true },
      });

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          clientId,
          direction: "OUTBOUND",
          body: result.body,
          providerMessageSid: result.providerMessageId,
          deliveryStatus: result.status,
          deliveryUpdatedAt: new Date(),
        },
      });
    });
  } catch (error) {
    logger.error("Recorded a confirm/cancel reply but couldn't mirror it to the inbox.", error, {
      businessId,
      clientId,
    });
  }
}

/**
 * Reads an inbound message for a confirm/cancel reply and, only when exactly
 * one upcoming reminded appointment matches, acts on it. Called by the
 * webhook route right after recordInboundMessage succeeds — separate from it
 * so the message-recording path (already heavily tested, with its own P2002
 * race handling) stays unchanged in behavior and risk surface.
 *
 * `messageId` is optional so every existing direct call/test keeps working
 * unchanged; the webhook route (its only real caller) always passes it. When
 * given, this is a thin wrapper that lets each inbound message be acted on
 * once: it claims the message with a compare-and-set on replyIntentHandledAt
 * before doing anything, and a delivery that finds it already claimed returns
 * without touching the appointment or sending a reply. That covers both
 * shapes of a worker retry — one that arrives after the first attempt fully
 * succeeded (its 200 was lost in transit), and one that arrives while the
 * first is still running (the worker gives up after 10s, but the request
 * keeps going server-side); a plain check-then-act would let the second
 * overlap the first and reply twice. A check that throws releases its claim,
 * so the retry the resulting 5xx triggers still gets to do the work.
 */
export async function applyInboundReplyIntent(args: {
  businessId: string;
  clientId: string | null;
  body: string;
  messageId?: string | null;
  now?: Date;
}): Promise<ApplyReplyIntentResult> {
  const { messageId, now = new Date() } = args;

  // Nothing to claim when there is no message row, or when nothing could be
  // acted on anyway (ordinary chat text, or a phone that matched no single
  // client): those would only add a write to every inbound message.
  if (!messageId || !args.clientId || !classifyReplyIntent(args.body)) {
    return applyInboundReplyIntentCore(args, now);
  }

  const claim = await prisma.message.updateMany({
    where: { id: messageId, replyIntentHandledAt: null },
    data: { replyIntentHandledAt: now },
  });
  if (claim.count === 0) {
    return { applied: false, reason: "already_handled" };
  }

  try {
    return await applyInboundReplyIntentCore(args, now);
  } catch (error) {
    // Best-effort release. If it fails the retry finds the message claimed and
    // skips it: the patient's message is still in the Inbox for staff, which
    // is the same outcome the original swallowed-error behavior had.
    await prisma.message
      .updateMany({ where: { id: messageId }, data: { replyIntentHandledAt: null } })
      .catch((releaseError) => {
        logger.error("A reply-intent check failed and its claim couldn't be released.", releaseError, {
          businessId: args.businessId,
        });
      });
    throw error;
  }
}

async function applyInboundReplyIntentCore(
  args: { businessId: string; clientId: string | null; body: string },
  now: Date
): Promise<ApplyReplyIntentResult> {
  const { businessId, clientId, body } = args;

  const intent = classifyReplyIntent(body);
  if (!intent) {
    return { applied: false, reason: "no_intent" };
  }
  if (!clientId) {
    return { applied: false, reason: "no_client" };
  }

  // While a waiting-list slot offer to this client is open, a "yes" most
  // likely answers the offer — not a reminder — so it must not confirm (or a
  // "no" cancel) some other appointment. Stand down; the message is already
  // in the Inbox for staff to act on. Only while the offer is still live
  // (entry still holds it, slot still cancelled and ahead) — once its slot
  // passes or the appointment is back on, replies go back to normal. A sent
  // offer stays live for its whole lifetime, however long that is — there was
  // previously also a 48-hour cutoff on top of this liveness check, which cut
  // in well before a genuinely still-open offer could ever go stale, letting
  // a late "2" fall through and cancel an unrelated appointment instead
  // (Codex).
  const openOffer = await prisma.followUpDraft.findFirst({
    where: {
      businessId,
      clientId,
      status: "SENT",
      ...liveSlotOfferWhere(now),
    },
    select: { id: true },
  });
  if (openOffer) {
    return { applied: false, reason: "open_offer" };
  }

  // A reminder goes to pending and confirmed appointments alike and invites
  // "1 to confirm", so both statuses are candidates for either reply: cancelling
  // an already-confirmed visit is the far more common real case, and a patient
  // who replies 1 to an already-confirmed visit deserves the same
  // acknowledgement rather than silence.
  const candidateStatuses: AppointmentStatus[] = ["PENDING", "CONFIRMED"];

  const found = await prisma.appointment.findMany({
    where: {
      businessId,
      clientId,
      status: { in: candidateStatuses },
      startAt: { gt: now },
      reminders: { some: { status: "SENT" } },
    },
    select: { id: true, startAt: true, status: true, client: { select: { phone: true, name: true } } },
  });

  // Confirming prefers a pending visit: a client with one pending and one
  // confirmed upcoming visit still confirms the pending one.
  const candidates =
    intent === "confirm" && found.some((appointment) => appointment.status === "PENDING")
      ? found.filter((appointment) => appointment.status === "PENDING")
      : found;

  if (candidates.length !== 1) {
    return { applied: false, reason: candidates.length === 0 ? "no_match" : "ambiguous" };
  }

  const appointment = candidates[0];
  const phone = appointment.client.phone;

  if (intent === "confirm") {
    // Sends the acknowledgement and mirrors it into the client's Inbox thread.
    const sendConfirmedReply = async (confirmedClientId: string) => {
      if (!phone) return;
      const result = await sendMessage({
        channel: "WHATSAPP",
        businessId,
        to: phone,
        message: {
          kind: "freeform",
          body: `You're confirmed for ${formatZonedTime(appointment.startAt)} on ${formatZonedFullDate(appointment.startAt)}. See you then!`,
        },
      });
      if (result.ok) {
        await mirrorOutboundReplyToInbox({
          businessId,
          clientId: confirmedClientId,
          clientName: appointment.client.name,
          phone,
          result,
        });
      }
    };

    if (appointment.status === "CONFIRMED") {
      // Nothing to change — just answer the reply.
      await sendConfirmedReply(clientId);
      return { applied: false, reason: "already_confirmed" };
    }

    const outcome = await confirmAppointmentCore({ id: appointment.id, businessId });
    if (!outcome.ok || !outcome.changed) {
      return { applied: false, reason: "no_match" };
    }
    await sendConfirmedReply(outcome.clientId);
    revalidateCalendarSurfaces([outcome.clientId], outcome.staffMemberId ? [outcome.staffMemberId] : []);
    return { applied: true, intent: "confirm", appointmentId: appointment.id };
  }

  const outcome = await cancelAppointmentCore({ id: appointment.id, businessId });
  if (!outcome.ok || !outcome.changed) {
    return { applied: false, reason: "no_match" };
  }
  if (phone) {
    const result = await sendMessage({
      channel: "WHATSAPP",
      businessId,
      to: phone,
      message: {
        kind: "freeform",
        body: `Your appointment on ${formatZonedFullDate(appointment.startAt)} at ${formatZonedTime(appointment.startAt)} has been cancelled.`,
      },
    });
    if (result.ok) {
      await mirrorOutboundReplyToInbox({
        businessId,
        clientId: outcome.clientId,
        clientName: appointment.client.name,
        phone,
        result,
      });
    }
  }
  if (outcome.staffMemberId) {
    await notifyStaffOfAppointmentChange(businessId, outcome.staffMemberId, appointment.id, "changed");
  }
  revalidateCalendarSurfaces([outcome.clientId], outcome.staffMemberId ? [outcome.staffMemberId] : []);

  return { applied: true, intent: "cancel", appointmentId: appointment.id };
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
