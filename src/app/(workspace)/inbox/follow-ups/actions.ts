"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import { sendMessage } from "@/lib/messaging";
import {
  dismissFollowUpDraft,
  markFollowUpDraftSent,
  revertFollowUpDraftToPending,
} from "@/lib/follow-ups-data";

export type FollowUpDraftActionResult = { ok: boolean; error?: string };

function getAuthedBusiness() {
  return getAuthedBusinessContext("Your session expired. Log in again to manage follow-ups.");
}

/**
 * Flips a pending draft to SENT (atomic compare-and-set — see
 * markFollowUpDraftSent), then sends it through the messaging seam. Any
 * failure past the flip (no phone on file, the provider send itself failing)
 * reverts the draft back to PENDING so it can be retried, rather than leaving
 * it stuck as SENT with nothing actually delivered.
 *
 * `body` is an optional edited-text override — the row list lets staff edit
 * the draft before sending, so the flip and the send must use the text the
 * operator actually approved, not necessarily the stored draft.body.
 */
export async function sendFollowUpDraftAction(
  draftId: string,
  body?: string
): Promise<FollowUpDraftActionResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const business = context.business;

  // An override was explicitly passed (even if it's just whitespace) — this
  // is a real RPC boundary, so validate it ourselves rather than trusting the
  // UI's own client-side guard. Reject before any state change so a blank
  // edit never flips the draft to SENT only to have to revert it.
  const editedBody = body?.trim();

  if (body !== undefined && !editedBody) {
    return { ok: false, error: "Write a message before sending." };
  }

  const flip = await markFollowUpDraftSent({ id: draftId, businessId: business.id });

  if (!flip.ok) {
    return { ok: false, error: flip.error };
  }

  const draft = await prisma.followUpDraft.findFirst({
    where: { id: draftId, businessId: business.id },
    select: { id: true, body: true, client: { select: { phone: true } } },
  });

  if (!draft?.client.phone) {
    await revertFollowUpDraftToPending({ id: draftId, businessId: business.id });
    return { ok: false, error: "This client has no phone number on file." };
  }

  const messageBody = editedBody && editedBody.length > 0 ? editedBody : draft.body;

  const result = await sendMessage({
    channel: "WHATSAPP",
    businessId: business.id,
    to: draft.client.phone,
    message: { kind: "freeform", body: messageBody },
  });

  if (!result.ok) {
    await revertFollowUpDraftToPending({ id: draftId, businessId: business.id });
    return { ok: false, error: "Couldn't send this message. Try again." };
  }

  revalidatePath("/inbox/follow-ups");
  revalidatePath("/inbox");
  return { ok: true };
}

export async function dismissFollowUpDraftAction(draftId: string): Promise<FollowUpDraftActionResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const outcome = await dismissFollowUpDraft({ id: draftId, businessId: context.business.id });

  if (!outcome.ok) {
    return outcome;
  }

  revalidatePath("/inbox/follow-ups");
  revalidatePath("/inbox");
  return { ok: true };
}
