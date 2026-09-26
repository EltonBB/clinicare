"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { sendMessage } from "@/lib/messaging";
import type { SendMessageResult } from "@/lib/messaging/types";
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
 * failure past the flip (no phone on file, the provider send failing, or a
 * lookup/send that throws) reverts the draft back to PENDING so it can be
 * retried, rather than leaving it stuck as SENT with nothing actually delivered.
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

  let failure: string | null = null;
  let sent: {
    clientId: string;
    clientName: string | null;
    phone: string;
    result: Extract<SendMessageResult, { ok: true }>;
  } | null = null;

  try {
    const draft = await prisma.followUpDraft.findFirst({
      where: { id: draftId, businessId: business.id },
      select: { id: true, body: true, clientId: true, client: { select: { phone: true, name: true } } },
    });

    if (!draft?.client.phone) {
      failure = "This client has no phone number on file.";
    } else {
      const result = await sendMessage({
        channel: "WHATSAPP",
        businessId: business.id,
        to: draft.client.phone,
        message: { kind: "freeform", body: editedBody && editedBody.length > 0 ? editedBody : draft.body },
      });

      if (result.ok) {
        sent = { clientId: draft.clientId, clientName: draft.client.name, phone: draft.client.phone, result };
      } else {
        failure = "Couldn't send this message. Try again.";
      }
    }
  } catch (error) {
    // The flip already happened. A lookup that throws (say a database error)
    // means nothing was sent, so put the draft back rather than strand it as
    // SENT — every retry would otherwise answer "already handled".
    logger.error("A follow-up send failed after the draft was marked sent.", error, {
      businessId: business.id,
      draftId,
    });
    failure = "Couldn't send this message. Try again.";
  }

  if (!sent) {
    await revertFollowUpDraftToPending({ id: draftId, businessId: business.id });
    return { ok: false, error: failure ?? "Couldn't send this message. Try again." };
  }

  // Mirror into the client's Inbox thread — same pattern as reminders.ts and
  // sendInboxMessageAction: upsert the Conversation by its (businessId,
  // phoneKey) key, then create the OUTBOUND Message with the provider ids so
  // a later delivery-status webhook has a row to match against. Best-effort:
  // the draft is already flipped to SENT and the WhatsApp message already
  // went out, so a failure here must not undo either — only the Inbox mirror
  // is lost.
  const phoneKey = phoneLookupKey(sent.phone);
  if (phoneKey) {
    const normalizedPhone = normalizePhone(sent.phone);
    try {
      await prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.upsert({
          where: {
            businessId_phoneKey: { businessId: business.id, phoneKey },
          },
          update: {
            contactName: sent.clientName || undefined,
          },
          create: {
            businessId: business.id,
            phoneNumber: normalizedPhone,
            phoneKey,
            contactName: sent.clientName || normalizedPhone,
            unreadCount: 0,
          },
          select: { id: true },
        });

        await tx.message.create({
          data: {
            conversationId: conversation.id,
            clientId: sent.clientId,
            direction: "OUTBOUND",
            body: sent.result.body,
            providerMessageSid: sent.result.providerMessageId,
            deliveryStatus: sent.result.status,
            deliveryUpdatedAt: new Date(),
          },
        });
      });
    } catch (error) {
      logger.error("Sent a follow-up draft but couldn't mirror it to the inbox.", error, {
        businessId: business.id,
        draftId,
      });
    }
  }

  revalidatePath("/inbox/follow-ups");
  revalidatePath("/inbox");
  return { ok: true };
}

export type BookFollowUpSlotResult = { ok: true; bookingUrl: string } | { ok: false; error: string };

/**
 * Turns a sent slot-offer draft into a pre-filled booking link. Only a SENT
 * SLOT_OFFER draft qualifies (mirrors FollowUpDraftItem.canBook) — anything
 * else (not found, wrong kind, still PENDING, already DISMISSED/EXPIRED)
 * returns the same plain "no longer available" error, since none of those
 * cases are actionable here.
 *
 * The linked waitlist entry is flipped OFFERED -> FILLED right here, at the
 * point staff commits to booking by clicking "Book" — not when the booking
 * form is actually saved. The calendar's saveAppointmentAction has no cheap
 * way today to know a given save originated from a waitlist offer (that would
 * mean threading a hidden waitlist-entry id through the booking form and its
 * save path), so flipping status at save time isn't simple. Flipping here
 * instead is slightly early — a staff member who clicks Book and then
 * abandons the form leaves the entry marked FILLED with no appointment — but
 * that gap is small and easy to recover from manually, versus the complexity
 * of threading state through an unrelated form. A future PR can tighten this
 * if it proves to matter in practice.
 */
export async function bookFollowUpSlotAction(draftId: string): Promise<BookFollowUpSlotResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const business = context.business;

  const draft = await prisma.followUpDraft.findFirst({
    where: { id: draftId, businessId: business.id, kind: "SLOT_OFFER", status: "SENT" },
    select: {
      clientId: true,
      appointment: { select: { title: true, staffMemberId: true } },
    },
  });

  if (!draft) {
    return { ok: false, error: "This slot offer is no longer available." };
  }

  const params = new URLSearchParams({ client: draft.clientId });
  if (draft.appointment?.title) {
    params.set("service", draft.appointment.title);
  }
  if (draft.appointment?.staffMemberId) {
    params.set("staffMemberId", draft.appointment.staffMemberId);
  }

  await prisma.waitlistEntry.updateMany({
    where: { businessId: business.id, status: "OFFERED", followUpDrafts: { some: { id: draftId } } },
    data: { status: "FILLED" },
  });

  revalidatePath("/inbox/follow-ups");

  return { ok: true, bookingUrl: `/calendar/new?${params.toString()}` };
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
