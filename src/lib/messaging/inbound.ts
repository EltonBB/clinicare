import {
  cancelAppointmentCore,
  confirmAppointmentCore,
  notifyStaffOfAppointmentChange,
  revalidateCalendarSurfaces,
} from "@/lib/appointments-shared";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { sendMessage } from "@/lib/messaging";
import { mirrorOutboundToInbox } from "@/lib/messaging/inbox-mirror";
import { prisma } from "@/lib/prisma";
import { classifyReplyIntent } from "@/lib/reply-intent";
import { liveSlotOfferWhere } from "@/lib/slot-offers";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";

import type { AppointmentStatus } from "@prisma/client";

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
  // matching becomes conservative. Computed unconditionally before the dedup
  // check below — a duplicate simply doesn't use it (it returns the message's
  // own stored clientId instead, see below) — because that's cheaper than
  // restructuring around whether this turns out to be new.
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
      select: { id: true, clientId: true },
    });
    if (existing) {
      // Return the identity this message was actually stored under, not a
      // fresh re-resolve of `matchingClient` — if the phone was reassigned,
      // or a previously-ambiguous match resolved differently (a duplicate
      // client record removed), between the original delivery and this
      // retry, re-resolving could hand a "2" reply to a different client
      // than the one the message was originally recorded against, cancelling
      // the wrong person's appointment (Codex #131).
      return { recorded: false, reason: "duplicate", clientId: existing.clientId, messageId: existing.id };
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
        select: { id: true, clientId: true },
      });
      // winner should always exist (that's what the P2002 collided on); null
      // only if it's somehow gone by the time we look again. applyInboundReplyIntent
      // treats a null/undefined messageId as "no claim to take", same as not
      // passing one at all — a safe fallback, not a silent bug.
      // Same reasoning as the dedup branch above: return the identity the
      // winning row was actually stored under, not a fresh re-resolve of
      // `matchingClient` (Codex #131).
      return {
        recorded: false,
        reason: "duplicate",
        clientId: winner?.clientId ?? null,
        messageId: winner?.id ?? null,
      };
    }
    throw error;
  }

  return { recorded: true, conversationId, clientId: matchingClient?.id ?? null, messageId };
}

export type ApplyReplyIntentResult =
  | {
      applied: false;
      reason:
        | "no_intent"
        | "no_client"
        | "no_match"
        | "ambiguous"
        | "already_confirmed"
        | "open_offer"
        | "already_handled"
        | "in_progress"
        | "offer_sending";
    }
  | { applied: true; intent: "confirm" | "cancel"; appointmentId: string };

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
 * once: it claims the message with a compare-and-set on replyIntentLeaseUntil
 * before doing anything, and a delivery that finds it already claimed returns
 * without touching the appointment or sending a reply. That covers both
 * shapes of a worker retry — one that arrives after the first attempt fully
 * succeeded (its 200 was lost in transit), and one that arrives while the
 * first is still running (the worker gives up after 10s, but the request
 * keeps going server-side); a plain check-then-act would let the second
 * overlap the first and reply twice. A check that throws releases its claim,
 * so the retry the resulting 5xx triggers still gets to do the work.
 *
 * While the check runs, the claim is a lease (replyIntentLeaseUntil, a time in
 * the future); once it finishes, replyIntentHandledAt records that it did. So a
 * delivery that finds the message claimed can tell the two apart: a finished
 * claim is "already_handled", but a running one is "in_progress", which the
 * webhook answers with a 5xx so the worker keeps retrying — if the running
 * check then fails and releases its claim, a later retry still does the work,
 * instead of having been told with a 200 that it was done (Codex #130).
 *
 * A lease that runs out was abandoned (the instance running the check died
 * before it could finish or release): a late retry can claim it again, and the
 * ones no retry came back for are handed to staff by
 * handOffAbandonedReplyIntents, which the hourly reminders cron runs (Codex
 * #130, #133).
 */
// Comfortably longer than one check can run: a few queries plus the
// acknowledgement send, which the messaging adapter gives up on after 25s.
const REPLY_INTENT_LEASE_MS = 2 * 60 * 1000;
// Under the worker's 10s request timeout, so the waiting retry still answers.
const IN_PROGRESS_WAIT_MS = 8_000;
const IN_PROGRESS_POLL_MS = 500;

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

  // A delivery that finds the message claimed by a check that is still running
  // waits for it here, rather than answering at once: the worker's retries come
  // 1, 2 and 4 seconds apart, so answering each one immediately would spend all
  // of them in about 17 seconds — sooner than a check (whose acknowledgement
  // send alone may take 25s) can fail and release its claim, leaving no retry
  // to do the work (Codex #130). Waiting up to IN_PROGRESS_WAIT_MS per retry,
  // inside the worker's 10s request timeout, stretches them to about 40s.
  const waitUntil = Date.now() + IN_PROGRESS_WAIT_MS;
  let lease: Date;
  let claimedAt: Date;
  for (;;) {
    const attemptAt = new Date();
    const leaseUntil = new Date(attemptAt.getTime() + REPLY_INTENT_LEASE_MS);
    const claim = await prisma.message.updateMany({
      where: {
        id: messageId,
        replyIntentHandledAt: null,
        OR: [{ replyIntentLeaseUntil: null }, { replyIntentLeaseUntil: { lte: attemptAt } }],
      },
      data: { replyIntentLeaseUntil: leaseUntil },
    });
    if (claim.count === 1) {
      lease = leaseUntil;
      claimedAt = attemptAt;
      break;
    }

    const claimed = await prisma.message.findUnique({
      where: { id: messageId },
      select: { replyIntentHandledAt: true, replyIntentLeaseUntil: true },
    });
    // A message deleted since (its conversation removed) has nothing left to act on.
    if (!claimed || claimed.replyIntentHandledAt) {
      return { applied: false, reason: "already_handled" };
    }
    if (Date.now() >= waitUntil) {
      return { applied: false, reason: "in_progress" };
    }
    // Released or run out since the claim attempt: try to claim it again at once.
    if (claimed.replyIntentLeaseUntil && claimed.replyIntentLeaseUntil > new Date()) {
      await new Promise((resolve) => setTimeout(resolve, IN_PROGRESS_POLL_MS));
    }
  }

  // Release and finish only touch this run's own lease: if it ran out and
  // another run took the message over, that run owns it now.
  const ownLease = { id: messageId, replyIntentLeaseUntil: lease };

  let result: ApplyReplyIntentResult;
  try {
    result = await applyInboundReplyIntentCore(args, now);
  } catch (error) {
    // Best-effort release. If it fails, the lease simply runs out, and the
    // hourly sweep hands the message to staff (handOffAbandonedReplyIntents).
    await prisma.message
      .updateMany({ where: ownLease, data: { replyIntentLeaseUntil: null } })
      .catch((releaseError) => {
        logger.error("A reply-intent check failed and its claim couldn't be released.", releaseError, {
          businessId: args.businessId,
        });
      });
    throw error;
  }

  // A slot offer to this client is still being sent, so the reply can't be
  // routed yet (see applyInboundReplyIntentCore): release the claim and report
  // it in progress, so the webhook answers 503 and the worker's retry, a few
  // seconds on, takes it again once the send has settled. If it never settles
  // within the retries, the message stays in the Inbox, unapplied rather than
  // applied to the wrong visit.
  if (!result.applied && result.reason === "offer_sending") {
    await prisma.message
      .updateMany({ where: ownLease, data: { replyIntentLeaseUntil: null } })
      .catch((releaseError) => {
        logger.error("Couldn't release a reply-intent claim while an offer was being sent.", releaseError, {
          businessId: args.businessId,
        });
      });
    return { applied: false, reason: "in_progress" };
  }

  // From here a retry is told the message is handled. Not fatal if it fails:
  // the lease runs out and the hourly sweep hands the message to staff, which
  // at worst flags a reply that was already dealt with.
  // Stamped with the time the check started, as the old single-column code
  // did. The lease is left in place: every row the new code finishes keeps one,
  // so the post-deploy rerun of prisma/whatsapp-reliability-migration.sql —
  // which converts only rows with no lease, i.e. ones the old code wrote — can
  // never turn a finished check back into an expired lease (Codex #133).
  await prisma.message
    .updateMany({ where: ownLease, data: { replyIntentHandledAt: claimedAt } })
    .catch((finishError) => {
      logger.error("A reply-intent check finished but its claim couldn't be marked done.", finishError, {
        businessId: args.businessId,
      });
    });
  return result;
}

// Abandoned claims handed to staff per run; each is two quick writes.
const ABANDONED_REPLY_BATCH = 200;

/**
 * Hands to staff the inbound replies whose reply check was abandoned: the
 * instance checking it died after claiming it and before finishing or releasing
 * it, and no worker retry came back once its lease ran out (they stop within a
 * minute; the lease is two). Left alone, the claim would sit there and the
 * patient's confirm or cancel would go unapplied without anyone knowing
 * (Codex #130).
 *
 * It is not applied automatically this late. By now staff may have cancelled,
 * moved, deleted or rebooked the patient's visits, sent them a slot offer, or
 * the patient may have written again — and a reply matched against today's
 * bookings can land on a visit they never meant. Nothing records what the
 * patient was looking at when they wrote, and each guard for one of those
 * cases left another open (Codex #133). So the claim is closed and the
 * conversation is marked unread: the reply — already in the Inbox, with no
 * acknowledgement after it — comes back to staff, who can see what it meant.
 * A late worker retry and this sweep can't both act on a message: each takes
 * it with the same compare-and-set. Run hourly by the reminders cron.
 */
export async function handOffAbandonedReplyIntents(now = new Date()): Promise<{ handedOff: number }> {
  const abandoned = await prisma.message.findMany({
    where: { direction: "INBOUND", replyIntentHandledAt: null, replyIntentLeaseUntil: { lte: now } },
    select: { id: true, conversationId: true },
    orderBy: { replyIntentLeaseUntil: "asc" },
    take: ABANDONED_REPLY_BATCH,
  });

  let handedOff = 0;
  for (const message of abandoned) {
    try {
      const closed = await prisma.$transaction(async (tx) => {
        const { count } = await tx.message.updateMany({
          where: { id: message.id, replyIntentHandledAt: null, replyIntentLeaseUntil: { lte: now } },
          // The lease stays, as on every row the new code finishes (see the
          // finish in applyInboundReplyIntent).
          data: { replyIntentHandledAt: now },
        });
        if (count === 1 && message.conversationId) {
          await tx.conversation.updateMany({
            where: { id: message.conversationId, unreadCount: 0 },
            data: { unreadCount: 1 },
          });
        }
        return count === 1;
      });
      if (closed) {
        handedOff += 1;
        logger.warn("Handed an abandoned reply check to staff.", { messageId: message.id });
      }
    } catch (error) {
      logger.error("Couldn't hand an abandoned reply check to staff.", error, { messageId: message.id });
    }
  }
  return { handedOff };
}

async function applyInboundReplyIntentCore(
  args: { businessId: string; clientId: string | null; body: string; messageId?: string | null },
  now: Date
): Promise<ApplyReplyIntentResult> {
  const { businessId, clientId, body, messageId } = args;

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
  //
  // An offer whose send has no recorded delivery yet (sentAt empty) is still
  // on its way — or it went out and recording that failed. Either way this
  // can't tell yet whether the reply answers it: acting on the reminder could
  // confirm or cancel the wrong visit, and standing down for good would drop a
  // reply that, should the send fail and the offer go back to Pending, was
  // meant for the reminder. So it is "offer_sending": the caller hands the
  // message back for the worker to retry in a few seconds, by which time the
  // send has settled (Codex #130). A delivered offer wins when there are both.
  const openOffer = await prisma.followUpDraft.findFirst({
    where: {
      businessId,
      clientId,
      status: "SENT",
      ...liveSlotOfferWhere(now),
    },
    select: { sentAt: true },
    orderBy: { sentAt: { sort: "desc", nulls: "last" } },
  });
  if (openOffer) {
    return { applied: false, reason: openOffer.sentAt ? "open_offer" : "offer_sending" };
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

  // Answers the patient and mirrors the answer into the client's Inbox thread.
  // Keyed by the patient's message: a delivery the worker retries (after a check
  // that failed past this point released its claim) runs this again, and a
  // confirm then takes the already-confirmed path and answers once more — the
  // key makes that second answer a replay, not a second message. Unkeyed only
  // when there is no stored message to name it. Any failure, uncertain included,
  // is left as it is: nothing retries an acknowledgement on its own, and an
  // uncertain one isn't mirrored since there's no confirmed message to show.
  const reply = async (repliedClientId: string) => {
    if (!phone) return;
    const time = formatZonedTime(appointment.startAt);
    const date = formatZonedFullDate(appointment.startAt);
    const result = await sendMessage({
      channel: "WHATSAPP",
      businessId,
      to: phone,
      message: {
        kind: "freeform",
        body:
          intent === "confirm"
            ? `You're confirmed for ${time} on ${date}. See you then!`
            : `Your appointment on ${date} at ${time} has been cancelled.`,
      },
      ...(messageId ? { idempotencyKey: `reply-ack:${messageId}` } : {}),
    });
    if (result.ok) {
      await mirrorOutboundToInbox({
        businessId,
        clientId: repliedClientId,
        clientName: appointment.client.name,
        phone,
        result,
        failureMessage: "Recorded a confirm/cancel reply but couldn't mirror it to the inbox.",
        logContext: { businessId, clientId: repliedClientId },
      });
    }
  };

  if (intent === "confirm" && appointment.status === "CONFIRMED") {
    // Nothing to change — just answer the reply.
    await reply(clientId);
    return { applied: false, reason: "already_confirmed" };
  }

  const core = intent === "confirm" ? confirmAppointmentCore : cancelAppointmentCore;
  const outcome = await core({ id: appointment.id, businessId });
  if (!outcome.ok || !outcome.changed) {
    return { applied: false, reason: "no_match" };
  }

  await reply(outcome.clientId);

  if (intent === "cancel" && outcome.staffMemberId) {
    await notifyStaffOfAppointmentChange(businessId, outcome.staffMemberId, appointment.id, "changed");
  }
  revalidateCalendarSurfaces([outcome.clientId], outcome.staffMemberId ? [outcome.staffMemberId] : []);

  return { applied: true, intent, appointmentId: appointment.id };
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
