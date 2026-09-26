import { prisma } from "@/lib/prisma";
import type { FollowUpDraftRecord } from "@/lib/follow-ups";

export async function getPendingFollowUpDraftCount(businessId: string): Promise<number> {
  return prisma.followUpDraft.count({ where: { businessId, status: "PENDING" } });
}

export async function listPendingFollowUpDrafts(businessId: string): Promise<FollowUpDraftRecord[]> {
  return prisma.followUpDraft.findMany({
    where: { businessId, status: "PENDING" },
    include: {
      client: { select: { name: true } },
      appointment: { select: { startAt: true, title: true } },
    },
    orderBy: { createdAt: "asc" },
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
