import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { FollowUpDraftRecord } from "@/lib/follow-ups";
import { liveSlotOfferWhere, reofferFreedSlot, retryOnWriteConflict } from "@/lib/slot-offers";

// A draft is actionable while it's PENDING — except a slot offer, which also
// needs its offer to still be live (entry still OFFERED, slot still cancelled
// and ahead — see liveSlotOfferWhere). A stale offer is hidden and refused
// between expiry sweeps instead of offering a slot that's gone.
function actionablePendingWhere(now: Date): Prisma.FollowUpDraftWhereInput {
  return {
    status: "PENDING",
    OR: [{ kind: { not: "SLOT_OFFER" } }, liveSlotOfferWhere(now)],
  };
}

export async function getPendingFollowUpDraftCount(businessId: string, now: Date = new Date()): Promise<number> {
  return prisma.followUpDraft.count({ where: { businessId, ...actionablePendingWhere(now) } });
}

// Generous upper bound on how many pending drafts could realistically queue up
// before staff clears them — guards against an unbounded Prisma query once
// PR 4/5's producers start actually populating this table (naming/comment
// style follows MAX_RISK_BATCH_SIZE in calendar/actions.ts).
const MAX_PENDING_FOLLOW_UPS = 200;

// Also surfaces a SENT slot offer while it's still live — the client was
// offered an opening and staff can still book it for them (see
// bookFollowUpSlotAction) or record that they declined it
// (passSlotOfferAction). A SENT draft of any other kind (e.g. a rebooking
// nudge that already went out) stays excluded — there's nothing left to do
// with it here.
export async function listPendingFollowUpDrafts(
  businessId: string,
  now: Date = new Date()
): Promise<FollowUpDraftRecord[]> {
  return prisma.followUpDraft.findMany({
    where: {
      businessId,
      OR: [actionablePendingWhere(now), { status: "SENT", ...liveSlotOfferWhere(now) }],
    },
    include: {
      client: { select: { name: true } },
      appointment: { select: { startAt: true, title: true } },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_PENDING_FOLLOW_UPS,
  });
}

type DraftMutationResult = { ok: true } | { ok: false; error: string };

const ALREADY_HANDLED_ERROR = "This follow-up was already handled.";
export const SLOT_OFFER_UNAVAILABLE_ERROR = "This slot offer is no longer available.";

/** Atomic PENDING -> SENT flip: two staff tapping Send at once can't both succeed, and a stale slot offer can't be sent. */
export async function markFollowUpDraftSent(args: {
  id: string;
  businessId: string;
  now?: Date;
}): Promise<DraftMutationResult> {
  const { id, businessId, now = new Date() } = args;
  const { count } = await prisma.followUpDraft.updateMany({
    where: { id, businessId, ...actionablePendingWhere(now) },
    data: { status: "SENT", sentAt: now },
  });
  return count === 0 ? { ok: false, error: ALREADY_HANDLED_ERROR } : { ok: true };
}

/** Reverts a SENT draft back to PENDING — used when the send itself fails, so it can be retried. */
export async function revertFollowUpDraftToPending(args: { id: string; businessId: string }): Promise<void> {
  await prisma.followUpDraft.updateMany({
    where: { id: args.id, businessId: args.businessId, status: "SENT" },
    data: { status: "PENDING", sentAt: null },
  });
}

/**
 * Skip: PENDING -> DISMISSED. Skipping a slot offer also puts its entry back
 * on the waiting list and offers the same slot to the next match, all in the
 * one transaction.
 */
export async function dismissFollowUpDraft(args: {
  id: string;
  businessId: string;
  now?: Date;
}): Promise<DraftMutationResult> {
  const { id, businessId, now = new Date() } = args;

  return retryOnWriteConflict(() => prisma.$transaction(async (tx): Promise<DraftMutationResult> => {
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

    if (draft.kind === "SLOT_OFFER") {
      await reofferFreedSlot(tx, {
        businessId,
        waitlistEntryId: draft.waitlistEntryId,
        appointmentId: draft.appointmentId,
        now,
      });
    }

    return { ok: true };
  }));
}

/**
 * The patient declined a sent slot offer: retire the draft (SENT ->
 * DISMISSED — it stays marked as sent via sentAt), put the entry back on the
 * waiting list, and offer the same slot to the next match. Only a sent offer
 * whose entry still holds it qualifies.
 */
export async function passSlotOffer(args: {
  id: string;
  businessId: string;
  now?: Date;
}): Promise<DraftMutationResult> {
  const { id, businessId, now = new Date() } = args;

  return retryOnWriteConflict(() => prisma.$transaction(async (tx): Promise<DraftMutationResult> => {
    const { count } = await tx.followUpDraft.updateMany({
      where: { id, businessId, kind: "SLOT_OFFER", status: "SENT", waitlistEntry: { status: "OFFERED" } },
      data: { status: "DISMISSED" },
    });

    if (count === 0) {
      return { ok: false, error: SLOT_OFFER_UNAVAILABLE_ERROR };
    }

    const draft = await tx.followUpDraft.findFirstOrThrow({
      where: { id, businessId },
      select: { waitlistEntryId: true, appointmentId: true },
    });

    await reofferFreedSlot(tx, { businessId, ...draft, now });

    return { ok: true };
  }));
}
