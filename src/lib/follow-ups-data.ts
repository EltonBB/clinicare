import { prisma } from "@/lib/prisma";
import type { FollowUpDraftRecord } from "@/lib/follow-ups";

export async function getPendingFollowUpDraftCount(businessId: string): Promise<number> {
  return prisma.followUpDraft.count({ where: { businessId, status: "PENDING" } });
}

// Generous upper bound on how many pending drafts could realistically queue up
// before staff clears them — guards against an unbounded Prisma query once
// PR 4/5's producers start actually populating this table (naming/comment
// style follows MAX_RISK_BATCH_SIZE in calendar/actions.ts).
const MAX_PENDING_FOLLOW_UPS = 200;

// Also surfaces a SENT slot offer while it's still actionable — the client was
// offered an opening (waitlistEntry.status: OFFERED) and staff can still book
// it for them from this list (see bookFollowUpSlotAction). A SENT draft of any
// other kind (e.g. a rebooking nudge that already went out) stays excluded —
// there's nothing left to do with it here.
export async function listPendingFollowUpDrafts(businessId: string): Promise<FollowUpDraftRecord[]> {
  return prisma.followUpDraft.findMany({
    where: {
      businessId,
      OR: [
        { status: "PENDING" },
        { status: "SENT", kind: "SLOT_OFFER", waitlistEntry: { status: "OFFERED" } },
      ],
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

/** Atomic PENDING -> SENT flip: two staff tapping Send at once can't both succeed. */
export async function markFollowUpDraftSent(args: {
  id: string;
  businessId: string;
  now?: Date;
}): Promise<DraftMutationResult> {
  const { id, businessId, now = new Date() } = args;
  const { count } = await prisma.followUpDraft.updateMany({
    where: { id, businessId, status: "PENDING" },
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

export async function dismissFollowUpDraft(args: { id: string; businessId: string }): Promise<DraftMutationResult> {
  const { count } = await prisma.followUpDraft.updateMany({
    where: { id: args.id, businessId: args.businessId, status: "PENDING" },
    data: { status: "DISMISSED" },
  });
  return count === 0 ? { ok: false, error: ALREADY_HANDLED_ERROR } : { ok: true };
}
