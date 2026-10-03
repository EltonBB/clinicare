import { BusinessPlan, Prisma } from "@prisma/client";

import { isProBusinessPlan } from "@/lib/billing";
import { ELIGIBLE_CLIENT_WHERE } from "@/lib/client-eligibility";
import { MAX_MESSAGE_BODY_LENGTH, MESSAGE_TOO_LONG_ERROR } from "@/lib/messaging/limits";
import { isSlotInsideOperatingHours } from "@/lib/operating-hours";
import { prisma } from "@/lib/prisma";
import type { FollowUpDraftRecord } from "@/lib/follow-ups";
import { liveSlotOfferWhere, reofferFreedSlot, retryOnWriteConflict } from "@/lib/slot-offers";
import { rebookedAppointmentWhere, workflowEnabledWhere } from "@/lib/workflow-generators";

// "Pro"/"not Pro" as billing.ts defines it — the same derivation as the
// sweep's non-Pro rule (follow-up-generation.ts), so no plan list is kept
// twice.
function proPlans(): BusinessPlan[] {
  return Object.values(BusinessPlan).filter((plan) => isProBusinessPlan(plan));
}

function nonProPlans(): BusinessPlan[] {
  return Object.values(BusinessPlan).filter((plan) => !isProBusinessPlan(plan));
}

// A draft is actionable while it's PENDING and what it's about still holds.
// The list, the Inbox count and Send's compare-and-set all use this one
// filter, so a draft that went stale since it was drafted is hidden and
// refused at once — not only once the hourly sweeps (expirePastSlotOffers,
// expireStaleFollowUpDrafts) retire it. A workflow the clinic has since
// switched Off is the one reason a draft is hidden here and NOT swept: it
// comes back if the workflow is switched on again (see workflowEnabledWhere).
//
// "What it's about still holds" is its own filter, without the status, because
// Send checks it twice: when it claims a PENDING draft and again, on the claimed
// SENT one, immediately before the message leaves (see confirmFollowUpDraftDispatch).
function actionablePendingWhere(now: Date): Prisma.FollowUpDraftWhereInput {
  return { status: "PENDING", ...stillHoldsWhere(now) };
}

function stillHoldsWhere(now: Date): Prisma.FollowUpDraftWhereInput {
  return {
    OR: [
      // Entry still holds the offer, slot still cancelled and ahead. No plan
      // check here — this same predicate feeds listableWhere below, and a
      // downgraded workspace's staff must still be able to see and Skip a
      // pending offer, matching Skip/Declined/Book's own "no plan check"
      // (see passSlotOfferAction). Sending one is blocked separately, in
      // markFollowUpDraftSent itself (Codex).
      liveSlotOfferWhere(now),
      // Not rebooked or back since (a future booking, or a recent confirmed/
      // completed visit — a walk-in recorded after the draft was made), still a
      // client the clinic wants to nudge, and the workspace is still on Pro
      // (rebooking nudges are a Pro feature — a downgrade stops them at once,
      // not only after the hourly sweep) with the rebooking workflow still
      // switched on.
      {
        kind: "REBOOK",
        business: { plan: { in: proPlans() }, ...workflowEnabledWhere("REBOOK") },
        client: {
          ...ELIGIBLE_CLIENT_WHERE,
          appointments: { none: rebookedAppointmentWhere(now) },
        },
      },
      // Still owed: never tell someone who just paid that they owe money. And
      // the payment-reminder workflow is still switched on, and the client is
      // one the clinic still contacts — an Inactive/Archived client gets no
      // automated outreach suggestion of any kind (Codex #130).
      {
        kind: "PAYMENT",
        business: workflowEnabledWhere("PAYMENT"),
        client: ELIGIBLE_CLIENT_WHERE,
        payment: { status: { in: ["Unpaid", "Partially Paid"] } },
      },
      // The visit still stands as attended — not since recorded as a no-show,
      // reverted, or deleted (a deleted appointment leaves appointmentId null)
      // — and the thank-you workflow is still switched on and the client still
      // one the clinic contacts.
      {
        kind: "THANK_YOU",
        business: workflowEnabledWhere("THANK_YOU"),
        client: ELIGIBLE_CLIENT_WHERE,
        appointment: { status: "COMPLETED" },
      },
    ],
  };
}

// What the Follow-ups page lists: everything actionable that's still pending,
// plus a slot offer that was already sent but is still live — the client was
// offered an opening and staff can still book it for them (see
// bookFollowUpSlotAction) or record that they declined it (passSlotOfferAction).
// A SENT draft of any other kind (e.g. a rebooking nudge that already went
// out) stays excluded — there's nothing left to do with it here. The Inbox
// badge counts this same set, so its only link to the page never disappears
// while a sent offer is waiting on staff.
function listableWhere(now: Date): Prisma.FollowUpDraftWhereInput {
  return { OR: [actionablePendingWhere(now), { status: "SENT", ...DELIVERED_WHERE, ...liveSlotOfferWhere(now) }] };
}

// Send claims a draft (-> SENT) before the message leaves and records `sentAt`
// only once it has: a SENT draft with no `sentAt` is still being sent, and may
// yet be put back to Pending. Book and Declined treat an offer as sent only
// once it was delivered, so another staff member can't fill or re-offer a slot
// while its offer is still on its way — a send that then failed would otherwise
// put the draft back to Pending beside an entry already booked (Codex #130).
// A send cut off midway (the server stopped) is settled by the hourly sweep
// (settleInterruptedFollowUpSends).
export const DELIVERED_WHERE = { sentAt: { not: null } } satisfies Prisma.FollowUpDraftWhereInput;

// A send runs well under this (the messaging bridge gives up after 25s).
const INTERRUPTED_SEND_AFTER_MS = 2 * 60 * 1000;

/**
 * Hourly: a draft still marked as being sent long after any send could have
 * finished was cut off midway, so whether its message left is unknown. It is
 * counted as sent — never sent twice — and so becomes visible again: a slot
 * offer stuck in between would otherwise stay hidden, its slot blocked from
 * being offered to anyone else, until the slot passed.
 */
export async function settleInterruptedFollowUpSends(now: Date): Promise<number> {
  const { count } = await prisma.followUpDraft.updateMany({
    where: { status: "SENT", sentAt: null, updatedAt: { lt: new Date(now.getTime() - INTERRUPTED_SEND_AFTER_MS) } },
    data: { sentAt: now },
  });
  return count;
}

export async function getPendingFollowUpDraftCount(businessId: string, now: Date = new Date()): Promise<number> {
  return prisma.followUpDraft.count({ where: { businessId, ...listableWhere(now) } });
}

// Upper bound on one page load — guards against an unbounded Prisma query,
// set to the system's actual structural ceiling rather than an arbitrary
// smaller number: the three generated kinds hold at most PENDING_CAP_PER_KIND
// (50) pending drafts each (follow-up-generation.ts) = 150, and a slot offer
// exists only for an entry that's WAITING or OFFERED — i.e. still counted
// against MAX_ACTIVE_WAITLIST_ENTRIES (500) — so every live draft this list
// can ever hold fits inside 650. A smaller cap here would silently hide the
// oldest live slot offers once a clinic had more than it open at once, with
// no way for staff to reach or send them (Codex).
const MAX_PENDING_FOLLOW_UPS = 650;

// Order: slot offers first — they're time-critical, and one buried under a
// backlog of nudges would sit unseen until its slot passed. Postgres sorts an
// enum by its declared order, and FollowUpDraftKind declares SLOT_OFFER first
// (a test pins that order in both the schema and the migration). Then newest
// first, id as a stable tiebreaker.
export async function listPendingFollowUpDrafts(
  businessId: string,
  now: Date = new Date()
): Promise<FollowUpDraftRecord[]> {
  return prisma.followUpDraft.findMany({
    where: { businessId, ...listableWhere(now) },
    include: {
      client: { select: { name: true } },
      appointment: { select: { startAt: true, title: true } },
    },
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }, { id: "asc" }],
    take: MAX_PENDING_FOLLOW_UPS,
  });
}

type DraftMutationResult = { ok: true } | { ok: false; error: string };

export type SentFollowUpDraft = {
  id: string;
  body: string;
  clientId: string;
  clientName: string | null;
  phone: string | null;
};

type MarkDraftSentResult = { ok: true; draft: SentFollowUpDraft } | { ok: false; error: string };

export const ALREADY_HANDLED_ERROR = "This follow-up was already handled.";
export const SLOT_OFFER_UNAVAILABLE_ERROR = "This slot offer is no longer available.";
export const SLOT_OUTSIDE_HOURS_ERROR =
  "This slot is outside your working hours now. Update your working hours in Settings, or skip or decline the offer.";

// Thrown inside markFollowUpDraftSent's transaction to roll the SENT flip back
// when the offered slot no longer fits the clinic's working hours.
class SlotOutsideHours extends Error {}

/**
 * Atomic PENDING -> SENT flip: two staff tapping Send at once can't both
 * succeed, and a draft that went stale since the page loaded (payment since
 * paid, client since rebooked, visit since recorded as a no-show, slot offer
 * gone) can't be sent — liveness is re-checked in this very write.
 *
 * `editedBody` persists the message staff actually approved (the row lets
 * them edit a draft before sending) into the stored draft — a live slot-offer
 * draft stays visible after it's sent, rendered from this same field, so
 * without this it would show the original template instead of what the
 * patient actually received (Codex).
 *
 * The client/phone lookup the caller needs to actually send the message is
 * read in the SAME transaction as the flip, not as a separate query after
 * it: a plain flip-then-read leaves a gap where another action (the slot
 * being filled/reactivated by someone else, the hourly sweep) could
 * invalidate the offer between the two calls — the flip already committed,
 * so the unguarded read would still return the row and the caller would
 * still send the now-stale offer (Codex).
 *
 * That is only the claim, though: the message itself is handed to the provider
 * afterwards, outside any transaction, so a draft can still be invalidated between
 * this commit and the send. The caller closes that with
 * confirmFollowUpDraftDispatch, immediately before it contacts the patient
 * (Codex #130).
 *
 * A slot offer also has to still fit the clinic's working hours: they can be
 * shortened, or a weekday closed, after the appointment was booked, and the
 * calendar would then refuse the very booking this message invites. That can't
 * be a SQL liveness filter (it needs the clinic's weekday and wall clock), so
 * it is checked here, in the flip's own transaction, which is rolled back when
 * the slot is outside the hours (Codex #130).
 *
 * An edited body longer than the messaging seam's cap is refused before
 * anything is written. The flip stores the body, and the seam rejects an
 * over-limit one only afterwards — so the failed send would put the draft back
 * to Pending with the oversized text still stored, unsendable on every retry
 * and inflating every pending draft's response (Codex #130).
 */
export async function markFollowUpDraftSent(args: {
  id: string;
  businessId: string;
  now?: Date;
  editedBody?: string;
}): Promise<MarkDraftSentResult> {
  const { id, businessId, now = new Date(), editedBody } = args;

  if (editedBody !== undefined && editedBody.length > MAX_MESSAGE_BODY_LENGTH) {
    return { ok: false, error: MESSAGE_TOO_LONG_ERROR };
  }

  return runSendGate({ id, businessId, now, stage: "claim", editedBody });
}

/**
 * The last check before a message leaves: the claim's whole check again, on the
 * claimed (SENT) draft, as late as the caller can make it — directly before it
 * hands the message to the provider. markFollowUpDraftSent commits first and the
 * send happens after, so anything another request commits in between is not seen
 * by the claim: a cancelled slot reactivated or filled (which expires its offer),
 * a payment settled, a client who booked or was archived, a workflow switched off
 * (Codex #130). Without this the patient would be sent the stale message anyway.
 *
 * It is a row-locked compare-and-set on the claim (a write that changes nothing
 * but takes the draft's lock, the same trick Book uses): a request that is midway
 * through retiring this very draft is waited for and the draft is then read as it
 * left it, and one that already committed is simply seen. A draft that no longer
 * qualifies - expired, dismissed, booked, or no longer live - refuses with the
 * same "already handled" error as a stale claim, and the caller puts it back to
 * Pending. The draft returned is read in the same transaction, so its body and
 * phone number are the ones to send.
 *
 * What it cannot close is the hand-off itself: a message can't be recalled, so a
 * change that commits while it is already on its way is no different from one
 * that commits just after it was sent. This keeps that to one round trip to the
 * messaging bridge instead of everything between the claim and the send. Holding a
 * lock across the send instead would pin a connection of the pool for the
 * bridge's whole timeout and make every invalidating request wait for it.
 */
export async function confirmFollowUpDraftDispatch(args: {
  id: string;
  businessId: string;
  now?: Date;
}): Promise<MarkDraftSentResult> {
  const { id, businessId, now = new Date() } = args;

  return runSendGate({ id, businessId, now, stage: "recheck" });
}

// The claim moves a PENDING draft to SENT; the re-check holds the draft in SENT.
// Both run the same compare-and-set, so there is one definition of "can this
// draft go out right now".
async function runSendGate(args: {
  id: string;
  businessId: string;
  now: Date;
  stage: "claim" | "recheck";
  editedBody?: string;
}): Promise<MarkDraftSentResult> {
  try {
    return await flipDraftToSent(args);
  } catch (error) {
    if (error instanceof SlotOutsideHours) {
      return { ok: false, error: SLOT_OUTSIDE_HOURS_ERROR };
    }
    throw error;
  }
}

function flipDraftToSent(args: {
  id: string;
  businessId: string;
  now: Date;
  stage: "claim" | "recheck";
  editedBody?: string;
}): Promise<MarkDraftSentResult> {
  const { id, businessId, now, stage, editedBody } = args;

  return retryOnWriteConflict(() =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.followUpDraft.updateMany({
        where: {
          id,
          businessId,
          status: stage === "claim" ? "PENDING" : "SENT",
          ...stillHoldsWhere(now),
          // A slot offer additionally needs the workspace still on Pro to be
          // sent — a downgrade stops staff from sending a new one at once, not
          // only once the hourly sweep catches up (matching the REBOOK branch's
          // own plan re-check above). Skip, Declined and Book stay reachable
          // regardless (see passSlotOfferAction's own "no plan check" comment),
          // so a downgraded workspace can still release an outstanding offer —
          // only Send is blocked here (Codex).
          NOT: { kind: "SLOT_OFFER", business: { plan: { in: nonProPlans() } } },
        },
        // The re-check changes nothing: it only needs the write's row lock.
        // The claim leaves `sentAt` empty: it is set by markFollowUpDraftDelivered
        // once the message has actually left (see DELIVERED_WHERE).
        data:
          stage === "claim"
            ? { status: "SENT", sentAt: null, ...(editedBody ? { body: editedBody } : {}) }
            : { status: "SENT" },
      });

      if (count === 0) {
        return { ok: false, error: ALREADY_HANDLED_ERROR };
      }

      const draft = await tx.followUpDraft.findFirstOrThrow({
        where: { id, businessId },
        select: {
          id: true,
          body: true,
          kind: true,
          clientId: true,
          client: { select: { phone: true, name: true } },
          appointment: { select: { startAt: true, endAt: true } },
        },
      });

      if (
        draft.kind === "SLOT_OFFER" &&
        draft.appointment &&
        !(await isSlotInsideOperatingHours(tx, { businessId, ...draft.appointment }))
      ) {
        throw new SlotOutsideHours();
      }

      return {
        ok: true,
        draft: {
          id: draft.id,
          body: draft.body,
          clientId: draft.clientId,
          clientName: draft.client.name,
          phone: draft.client.phone,
        },
      };
    })
  );
}

/**
 * Reverts a claimed draft back to PENDING — used when the send itself fails, so
 * it can be retried. Only one still being sent (no `sentAt`): a delivered draft
 * is never un-sent.
 */
export async function revertFollowUpDraftToPending(args: { id: string; businessId: string }): Promise<void> {
  await prisma.followUpDraft.updateMany({
    where: { id: args.id, businessId: args.businessId, status: "SENT", sentAt: null },
    data: { status: "PENDING" },
  });
}

/** Records that a claimed draft's message actually left — from now on it is sent (see DELIVERED_WHERE). */
export async function markFollowUpDraftDelivered(args: { id: string; businessId: string; now?: Date }): Promise<void> {
  await prisma.followUpDraft.updateMany({
    where: { id: args.id, businessId: args.businessId, status: "SENT", sentAt: null },
    data: { sentAt: args.now ?? new Date() },
  });
}

// Thrown inside a slot-offer transaction to roll it back when the offer turned
// out to be settled already — see settleOffer.
class OfferAlreadySettled extends Error {}

/**
 * Runs one Skip / Declined / Book transaction, retrying it once on a deadlock
 * (see retryOnWriteConflict). A callback that throws OfferAlreadySettled has
 * lost a race to another action on the same offer: Prisma rolls the whole
 * transaction back, so nothing it wrote survives, and the caller gets the
 * plain "already handled" result instead.
 */
async function settleOffer(
  run: (tx: Prisma.TransactionClient) => Promise<DraftMutationResult>,
  lostRaceError: string
): Promise<DraftMutationResult> {
  try {
    return await retryOnWriteConflict(() => prisma.$transaction(run));
  } catch (error) {
    if (error instanceof OfferAlreadySettled) {
      return { ok: false, error: lostRaceError };
    }
    throw error;
  }
}

/**
 * Skip: PENDING -> DISMISSED. Skipping a slot offer also puts its entry back
 * on the waiting list and offers the same slot to the next match, all in the
 * one transaction. If the entry can't be put back (it was booked or removed
 * meanwhile) the skip is rolled back — a dismissed draft must never sit beside
 * an entry that no longer holds its offer.
 */
export async function dismissFollowUpDraft(args: {
  id: string;
  businessId: string;
  now?: Date;
}): Promise<DraftMutationResult> {
  const { id, businessId, now = new Date() } = args;

  return settleOffer(async (tx) => {
    const { count } = await tx.followUpDraft.updateMany({
      where: { id, businessId, status: "PENDING" },
      data: { status: "DISMISSED" },
    });

    if (count === 0) {
      return { ok: false, error: ALREADY_HANDLED_ERROR };
    }

    const draft = await tx.followUpDraft.findFirstOrThrow({
      where: { id, businessId },
      select: { kind: true, waitlistEntryId: true, appointmentId: true },
    });

    if (draft.kind === "SLOT_OFFER" && draft.waitlistEntryId) {
      const { released } = await reofferFreedSlot(tx, {
        businessId,
        waitlistEntryId: draft.waitlistEntryId,
        appointmentId: draft.appointmentId,
        now,
      });

      if (!released) {
        throw new OfferAlreadySettled();
      }
    }

    return { ok: true };
  }, ALREADY_HANDLED_ERROR);
}

/**
 * The patient declined a sent slot offer: retire the draft (SENT ->
 * DISMISSED — it stays marked as sent via sentAt), put the entry back on the
 * waiting list, and offer the same slot to the next match. Only a sent offer
 * whose entry still holds it qualifies. If the entry can't be put back — Book
 * got to it first and marked it FILLED — the decline is rolled back and the
 * plain "no longer available" result returned, so the booking stands.
 */
export async function passSlotOffer(args: {
  id: string;
  businessId: string;
  now?: Date;
}): Promise<DraftMutationResult> {
  const { id, businessId, now = new Date() } = args;

  return settleOffer(async (tx) => {
    const { count } = await tx.followUpDraft.updateMany({
      where: {
        id,
        businessId,
        kind: "SLOT_OFFER",
        status: "SENT",
        ...DELIVERED_WHERE,
        waitlistEntry: { status: "OFFERED" },
      },
      data: { status: "DISMISSED" },
    });

    if (count === 0) {
      return { ok: false, error: SLOT_OFFER_UNAVAILABLE_ERROR };
    }

    const draft = await tx.followUpDraft.findFirstOrThrow({
      where: { id, businessId },
      select: { waitlistEntryId: true, appointmentId: true },
    });

    const { released } = await reofferFreedSlot(tx, { businessId, ...draft, now });

    if (!released) {
      throw new OfferAlreadySettled();
    }

    return { ok: true };
  }, SLOT_OFFER_UNAVAILABLE_ERROR);
}

/**
 * Book: staff commit to booking a patient into the slot they were offered —
 * the SENT offer's entry goes OFFERED -> FILLED (the draft stays SENT).
 *
 * Lock order is the one Skip, Declined, Remove, withdraw and expiry all use:
 * the draft row first, then the entry. The first write touches the draft row
 * without changing it, which queues this behind any of those already holding
 * it and lets them queue behind this; the guard is scalar (id, kind, status),
 * so it is re-checked against the row's latest version once the lock is won,
 * and a draft skipped, declined or expired in the meantime refuses the Book.
 * Only then is the entry flipped, pinned to that draft still being SENT and,
 * via `liveSlotOfferWhere`, to the same offer still being live — the
 * appointment still cancelled and ahead, the waiting client still eligible.
 * The caller's own read of `liveSlotOfferWhere` happens outside this
 * transaction (building the booking-form URL needs the appointment's
 * details), so it's stale by the time this runs; re-checking it here, inside
 * the same atomic write that flips OFFERED -> FILLED, is what actually closes
 * that window — a slot reactivated or filled through another path since the
 * read now fails the flip instead of silently marking the entry FILLED with
 * nothing booked and no way back onto the list (Codex).
 */
export async function bookSlotOffer(args: { id: string; businessId: string; now?: Date }): Promise<DraftMutationResult> {
  const { id, businessId, now = new Date() } = args;

  return settleOffer(async (tx) => {
    const { count: locked } = await tx.followUpDraft.updateMany({
      where: { id, businessId, kind: "SLOT_OFFER", status: "SENT", ...DELIVERED_WHERE },
      data: { status: "SENT" },
    });

    if (locked === 0) {
      return { ok: false, error: SLOT_OFFER_UNAVAILABLE_ERROR };
    }

    // The slot also has to still fit the clinic's working hours (see
    // markFollowUpDraftSent): checked once the draft is locked and before the
    // entry is flipped, so a refused Book leaves the entry OFFERED — it can still
    // be declined and offered on — instead of FILLED with a booking the calendar
    // will not accept (Codex #130).
    const offered = await tx.followUpDraft.findFirst({
      where: { id, businessId },
      select: { appointment: { select: { startAt: true, endAt: true } } },
    });

    if (offered?.appointment && !(await isSlotInsideOperatingHours(tx, { businessId, ...offered.appointment }))) {
      return { ok: false, error: SLOT_OUTSIDE_HOURS_ERROR };
    }

    const { count } = await tx.waitlistEntry.updateMany({
      where: {
        businessId,
        status: "OFFERED",
        followUpDrafts: { some: { id, ...liveSlotOfferWhere(now) } },
      },
      data: { status: "FILLED" },
    });

    // Removed, booked by someone else, or the offer stopped being live
    // (reactivated, or the client since archived/deactivated) since it was read.
    return count === 0 ? { ok: false, error: SLOT_OFFER_UNAVAILABLE_ERROR } : { ok: true };
  }, SLOT_OFFER_UNAVAILABLE_ERROR);
}
