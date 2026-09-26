import { Prisma } from "@prisma/client";

import { isProBusinessPlan } from "@/lib/billing";
import { timeToMinutes } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { rankWaitlistMatches } from "@/lib/slot-fill-matching";
import { formatZonedFullDate, formatZonedTime, formatZonedTime24, getZonedWeekday } from "@/lib/time-zone";
import { findMatchingWaitlistCandidates, releaseWaitlistEntry } from "@/lib/waitlist-data";

/**
 * Waiting-list slot offers (Pro). One lifecycle, shared by every path:
 *
 * - A cancellation frees a slot -> `offerFreedSlot` flips the best waiting
 *   entry WAITING -> OFFERED and drafts one SLOT_OFFER for it, atomically.
 * - The offer falls through (staff skip the draft, the patient declines, the
 *   slot passes, the appointment is un-cancelled) -> the draft is retired and
 *   the entry goes back to WAITING (`reofferFreedSlot`, `expirePastSlotOffers`,
 *   `withdrawSlotOffers`); skip and decline then offer the same slot to the
 *   next match. Removing an entry that holds an offer retires the offer and
 *   re-offers the slot too (`removeWaitlistEntry`).
 *
 * Invariant: an entry is OFFERED exactly while one of its SLOT_OFFER drafts
 * is live (PENDING or SENT). Every path that releases an entry retires that
 * draft in the same transaction, so a stale draft can never resurface when
 * the entry is later offered a different slot.
 */

export type FreedAppointment = {
  id: string;
  /** The client who gave the slot up — never offered it back. */
  clientId: string;
  staffMemberId: string | null;
  title: string;
  startAt: Date;
};

// How many ranked matches one offer tries before giving up — each miss is an
// entry a concurrent request claimed between the read and the flip.
const MAX_OFFER_ATTEMPTS = 5;

// Open offers one appointment or one entry can hold — one, by the invariant;
// the cap only bounds the query.
const MAX_OPEN_DRAFTS = 20;

/**
 * Minimum-necessary patient message: the waiting client's name and the freed
 * slot's date and time in the clinic's zone. Never the service or treatment.
 */
export function slotOfferBody(clientName: string, startAt: Date) {
  return `Hi ${clientName}, a slot has opened up on ${formatZonedFullDate(startAt)} at ${formatZonedTime(startAt)}. Reply here if you'd like it.`;
}

/**
 * Offers a freed slot to the best-matching waiting entry, inside the caller's
 * transaction. Does nothing unless the workspace is on Pro (re-checked here,
 * inside the transaction, so no caller can skip the gate) and the slot is
 * still ahead. Walks the ranked matches and stops at the first entry whose
 * WAITING -> OFFERED flip succeeds. The draft insert skips duplicates rather
 * than throwing — a unique violation would abort the whole transaction,
 * cancellation included. Returns the offered entry's id, or null.
 */
export async function offerFreedSlot(
  tx: Prisma.TransactionClient,
  args: { businessId: string; cancelled: FreedAppointment; now?: Date }
): Promise<string | null> {
  const { businessId, cancelled, now = new Date() } = args;

  if (cancelled.startAt.getTime() <= now.getTime()) {
    return null;
  }

  const business = await tx.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { plan: true },
  });

  if (!isProBusinessPlan(business.plan)) {
    return null;
  }

  // One live offer per freed slot. Skip, Declined and Remove retire the old
  // offer earlier in the same transaction, so they never trip this — it only
  // stops a second patient being offered a slot that is already on offer.
  const liveOffer = await tx.followUpDraft.findFirst({
    where: {
      businessId,
      appointmentId: cancelled.id,
      status: { in: ["PENDING", "SENT"] },
      ...liveSlotOfferWhere(now),
    },
    select: { id: true },
  });

  if (liveOffer) {
    return null;
  }

  const candidates = await findMatchingWaitlistCandidates({
    businessId,
    service: cancelled.title,
    excludeClientId: cancelled.clientId,
    freedAppointmentId: cancelled.id,
    tx,
  });

  // Waiting-list day/time preferences are clinic-local wall-clock values, so
  // the freed slot's weekday and time-of-day come from the clinic's zone too
  // (zoned Sun=0..Sat=6 mapped onto the schedule's Monday=0 convention — same
  // conversion as isInsideBusinessHours in calendar/actions.ts).
  const ranked = rankWaitlistMatches(candidates, {
    service: cancelled.title,
    staffMemberId: cancelled.staffMemberId,
    startAt: cancelled.startAt,
    weekday: (getZonedWeekday(cancelled.startAt) + 6) % 7,
    timeMinutes: timeToMinutes(formatZonedTime24(cancelled.startAt)),
  });

  for (const entry of ranked.slice(0, MAX_OFFER_ATTEMPTS)) {
    const { count: flipped } = await tx.waitlistEntry.updateMany({
      where: { id: entry.id, businessId, status: "WAITING" },
      data: { status: "OFFERED" },
    });

    if (flipped === 0) {
      continue; // claimed or removed since the read — try the next match
    }

    const { count: created } = await tx.followUpDraft.createMany({
      data: [
        {
          businessId,
          clientId: entry.clientId,
          kind: "SLOT_OFFER",
          status: "PENDING",
          appointmentId: cancelled.id,
          waitlistEntryId: entry.id,
          dedupeKey: `SLOT_OFFER:${cancelled.id}:${entry.id}`,
          body: slotOfferBody(entry.clientName, cancelled.startAt),
        },
      ],
      skipDuplicates: true,
    });

    if (created > 0) {
      return entry.id;
    }

    // This entry was already offered this slot (a concurrent write landed
    // after the read above) — don't leave it OFFERED without a live draft.
    await releaseWaitlistEntry({ id: entry.id, businessId }, tx);
  }

  return null;
}

/**
 * An offer fell through — staff skipped the draft or the patient declined —
 * and the caller has just retired its draft in `tx`. Puts the entry back on
 * the waiting list and offers the same freed slot to the next match (the
 * entry that let it go is excluded: it already has a draft for this slot).
 * Leaves the slot alone when the entry was booked or removed meanwhile, the
 * appointment was deleted, or it is no longer cancelled (reactivated).
 */
export async function reofferFreedSlot(
  tx: Prisma.TransactionClient,
  args: { businessId: string; waitlistEntryId: string | null; appointmentId: string | null; now?: Date }
): Promise<string | null> {
  const { businessId, waitlistEntryId, appointmentId, now } = args;

  if (!waitlistEntryId || !(await releaseWaitlistEntry({ id: waitlistEntryId, businessId }, tx))) {
    return null;
  }

  return offerSlotAgain(tx, { businessId, appointmentId, now });
}

/**
 * Offers an appointment's slot to the next match after its previous offer
 * was retired — only while the appointment still exists and is still
 * cancelled (offerFreedSlot itself checks the slot is still ahead).
 */
async function offerSlotAgain(
  tx: Prisma.TransactionClient,
  args: { businessId: string; appointmentId: string | null; now?: Date }
): Promise<string | null> {
  const { businessId, appointmentId, now } = args;

  if (!appointmentId) {
    return null;
  }

  const cancelled = await tx.appointment.findFirst({
    where: { id: appointmentId, businessId, status: "CANCELLED" },
    select: { id: true, clientId: true, staffMemberId: true, title: true, startAt: true },
  });

  return cancelled ? offerFreedSlot(tx, { businessId, cancelled, now }) : null;
}

/**
 * A slot offer is live while its entry still holds the offer and the freed
 * slot is still cancelled and ahead. Anything else is stale: hidden from the
 * Follow-ups list and count, refused by Send/Book, and retired by
 * expirePastSlotOffers.
 */
export function liveSlotOfferWhere(now: Date): Prisma.FollowUpDraftWhereInput {
  return {
    kind: "SLOT_OFFER",
    waitlistEntry: { status: "OFFERED" },
    appointment: { status: "CANCELLED", startAt: { gt: now } },
  };
}

function staleSlotWhere(now: Date): Prisma.FollowUpDraftWhereInput {
  return {
    OR: [
      { appointmentId: null },
      { appointment: { startAt: { lte: now } } },
      { appointment: { status: { not: "CANCELLED" } } },
    ],
  };
}

// A PENDING offer, or a SENT one the patient hasn't been booked into yet.
const OPEN_SLOT_OFFER_WHERE: Prisma.FollowUpDraftWhereInput = {
  OR: [{ status: "PENDING" }, { status: "SENT", waitlistEntry: { status: "OFFERED" } }],
};

// Bounds one sweep; a backlog beyond it is picked up by the next run.
const MAX_EXPIRE_BATCH = 200;

type OpenSlotOfferDraft = { id: string; businessId: string; waitlistEntryId: string | null };

/**
 * Retires one open offer draft: -> EXPIRED, guarded by `guard` (re-checked in
 * the write itself, so a draft booked, skipped, or declined since it was read
 * is left alone), then releases its entry only if this write applied.
 */
async function retireOpenSlotOffer(
  tx: Prisma.TransactionClient,
  draft: OpenSlotOfferDraft,
  guard: Prisma.FollowUpDraftWhereInput
): Promise<{ expired: boolean; released: boolean }> {
  const { count } = await tx.followUpDraft.updateMany({
    where: { id: draft.id, businessId: draft.businessId, ...guard },
    data: { status: "EXPIRED" },
  });

  if (count === 0) {
    return { expired: false, released: false };
  }

  const released = draft.waitlistEntryId
    ? await releaseWaitlistEntry({ id: draft.waitlistEntryId, businessId: draft.businessId }, tx)
    : false;

  return { expired: true, released };
}

/**
 * A cancelled appointment is back on (un-cancelled): its slot is taken again,
 * so any open offer for it is withdrawn — draft -> EXPIRED, entry back to
 * WAITING — inside the caller's transaction. Without this, cancelling the
 * same appointment again later would revive the old offer beside a new one
 * and tell two patients the same slot is free.
 */
export async function withdrawSlotOffers(
  tx: Prisma.TransactionClient,
  args: { businessId: string; appointmentId: string }
): Promise<{ expired: number; released: number }> {
  const guard: Prisma.FollowUpDraftWhereInput = {
    kind: "SLOT_OFFER",
    appointmentId: args.appointmentId,
    ...OPEN_SLOT_OFFER_WHERE,
  };

  const drafts = await tx.followUpDraft.findMany({
    where: { businessId: args.businessId, ...guard },
    select: { id: true, businessId: true, waitlistEntryId: true },
    take: MAX_OPEN_DRAFTS,
  });

  let expired = 0;
  let released = 0;

  for (const draft of drafts) {
    const outcome = await retireOpenSlotOffer(tx, draft, guard);
    expired += outcome.expired ? 1 : 0;
    released += outcome.released ? 1 : 0;
  }

  return { expired, released };
}

/**
 * Retires slot offers whose slot has passed (or whose appointment was deleted
 * or reactivated): the open draft -> EXPIRED and its entry OFFERED -> WAITING,
 * one small transaction per draft so the release only happens for a draft
 * this sweep actually retired. Idempotent and bounded; pass a businessId to
 * sweep one workspace (the follow-ups cron), omit it to sweep all.
 */
export async function expirePastSlotOffers(
  businessId?: string,
  now: Date = new Date()
): Promise<{ expired: number; released: number }> {
  const openStale: Prisma.FollowUpDraftWhereInput = {
    kind: "SLOT_OFFER",
    AND: [staleSlotWhere(now), OPEN_SLOT_OFFER_WHERE],
  };

  const drafts = await prisma.followUpDraft.findMany({
    where: { ...(businessId ? { businessId } : {}), ...openStale },
    select: { id: true, businessId: true, waitlistEntryId: true },
    orderBy: { createdAt: "asc" },
    take: MAX_EXPIRE_BATCH,
  });

  let expired = 0;
  let released = 0;

  for (const draft of drafts) {
    const outcome = await prisma.$transaction((tx) => retireOpenSlotOffer(tx, draft, openStale));

    expired += outcome.expired ? 1 : 0;
    released += outcome.released ? 1 : 0;
  }

  return { expired, released };
}

/**
 * Runs a slot-offer transaction, retrying it once if Postgres aborted it as a
 * deadlock / write conflict (Prisma P2034). Two staff acting on the same
 * offer at the same instant can collide; the retry sees the winner's
 * committed state and its CAS guards turn into clean no-ops.
 */
export async function retryOnWriteConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return run();
    }
    throw error;
  }
}

const ALREADY_REMOVED_ERROR = "This waiting-list entry was already removed.";

// Thrown inside removeWaitlistEntry's transaction to roll back the draft
// dismissals when the entry itself turned out to be gone already.
class EntryAlreadyGone extends Error {}

/**
 * Dismisses an entry's open offer draft(s) — the draft rows are locked here,
 * before the entry row, which is the same order every other path takes
 * (Skip, Declined, withdraw, expiry), so they can't deadlock on one offer.
 * Returns the freed appointments to offer again.
 */
async function dismissOpenOffersOfEntry(
  tx: Prisma.TransactionClient,
  args: { businessId: string; entryId: string }
): Promise<Array<string | null>> {
  const open: Prisma.FollowUpDraftWhereInput = {
    businessId: args.businessId,
    waitlistEntryId: args.entryId,
    kind: "SLOT_OFFER",
    ...OPEN_SLOT_OFFER_WHERE,
  };

  const drafts = await tx.followUpDraft.findMany({
    where: open,
    select: { id: true, appointmentId: true },
    take: MAX_OPEN_DRAFTS,
  });

  const freed: Array<string | null> = [];

  for (const draft of drafts) {
    const { count } = await tx.followUpDraft.updateMany({
      where: { id: draft.id, ...open },
      data: { status: "DISMISSED" },
    });

    if (count > 0) {
      freed.push(draft.appointmentId);
    }
  }

  return freed;
}

/**
 * Takes an entry off the waiting list (WAITING or OFFERED -> REMOVED), in one
 * transaction. An entry holding an offer counts as declining it: its open
 * offer draft is dismissed and the freed slot goes to the next match (the
 * removed entry is excluded — it's no longer WAITING and already has a draft
 * for that slot).
 *
 * Order: the offer drafts first, then the entry (see dismissOpenOffersOfEntry).
 * If the entry was already gone (FILLED, REMOVED, or not this business's),
 * the transaction rolls back so nothing is left dismissed, and the caller
 * gets a clean "already removed". An offer that landed on this entry while
 * the remove waited for its row lock is caught by a second pass after the
 * entry write, so its slot is re-offered rather than lost.
 */
export async function removeWaitlistEntry(args: {
  id: string;
  businessId: string;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { id, businessId, now = new Date() } = args;

  try {
    return await retryOnWriteConflict(() =>
      prisma.$transaction(async (tx): Promise<{ ok: true }> => {
        const freed = await dismissOpenOffersOfEntry(tx, { businessId, entryId: id });

        const { count } = await tx.waitlistEntry.updateMany({
          where: { id, businessId, status: { in: ["WAITING", "OFFERED"] } },
          data: { status: "REMOVED" },
        });

        if (count === 0) {
          throw new EntryAlreadyGone();
        }

        freed.push(...(await dismissOpenOffersOfEntry(tx, { businessId, entryId: id })));

        for (const appointmentId of freed) {
          await offerSlotAgain(tx, { businessId, appointmentId, now });
        }

        return { ok: true };
      })
    );
  } catch (error) {
    if (error instanceof EntryAlreadyGone) {
      return { ok: false, error: ALREADY_REMOVED_ERROR };
    }
    throw error;
  }
}
