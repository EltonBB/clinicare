"use server";

import { revalidatePath } from "next/cache";

import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import { logger } from "@/lib/logger";
import { sendMessage } from "@/lib/messaging";
import { mirrorOutboundToInbox } from "@/lib/messaging/inbox-mirror";
import { manualSendRefusal } from "@/lib/messaging/send-limits";
import type { SendMessageResult } from "@/lib/messaging/types";
import {
  ALREADY_HANDLED_ERROR,
  bookSlotOffer,
  confirmFollowUpDraftDispatch,
  dismissFollowUpDraft,
  markFollowUpDraftDelivered,
  markFollowUpDraftSent,
  passSlotOffer,
  revertFollowUpDraftToPending,
  SLOT_OFFER_UNAVAILABLE_ERROR,
} from "@/lib/follow-ups-data";
import { parseRecordId } from "@/lib/record-id";
import { formatZonedDateKey, formatZonedTime24, getZonedWallClockMinutesBetween } from "@/lib/time-zone";

/** `notice`: handled, but staff should know something — see the uncertain send below. */
export type FollowUpDraftActionResult = { ok: boolean; error?: string; notice?: string };

const TRY_AGAIN_ERROR = "Something went wrong. Try again.";
const FOLLOW_UP_DELIVERY_UNCERTAIN_NOTICE =
  "We couldn't confirm a follow-up was delivered, so it was marked as sent. Check the patient's WhatsApp chat before contacting them again.";

function getAuthedBusiness() {
  return getAuthedBusinessContext("Your session expired. Log in again to manage follow-ups.");
}

// Every surface a follow-up mutation feeds: the Follow-ups list, the Inbox's
// pending count, and — for slot offers — the Calendar's waiting-list panel,
// which shows each entry's offer state.
function revalidateFollowUpSurfaces() {
  revalidatePath("/inbox/follow-ups");
  revalidatePath("/inbox");
  revalidatePath("/calendar");
}

/**
 * Flips a pending draft to SENT (atomic compare-and-set — see
 * markFollowUpDraftSent), checks it once more (confirmFollowUpDraftDispatch),
 * then sends it through the messaging seam. Any failure past the flip (the last
 * check refusing, no phone on file, the provider send failing, or a lookup/send
 * that throws) reverts the draft back to PENDING so it can be retried, rather
 * than leaving it stuck as SENT with nothing actually delivered — except a send
 * whose delivery is uncertain, which may already be with the patient and is
 * recorded as sent instead (never retried).
 *
 * `body` is an optional edited-text override — the row list lets staff edit
 * the draft before sending, so the flip and the send must use the text the
 * operator actually approved, not necessarily the stored draft.body.
 */
export async function sendFollowUpDraftAction(
  rawDraftId: string,
  body?: string
): Promise<FollowUpDraftActionResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const business = context.business;

  // A non-string id would make the SENT flip below match every live draft.
  const draftId = parseRecordId(rawDraftId);

  if (!draftId) {
    return { ok: false, error: ALREADY_HANDLED_ERROR };
  }

  // An override was explicitly passed (even if it's just whitespace) — this
  // is a real RPC boundary, so validate it ourselves rather than trusting the
  // UI's own client-side guard. Reject before any state change so a blank
  // edit never flips the draft to SENT only to have to revert it.
  // Client-serialized args aren't type-checked at runtime, so a non-string
  // override is refused here rather than throwing on `.trim()`.
  const editedBody = typeof body === "string" ? body.trim() : undefined;

  if (body !== undefined && !editedBody) {
    return { ok: false, error: "Write a message before sending." };
  }

  // Before the draft is touched, so a refused send leaves it as it was.
  const sendRefusal = await manualSendRefusal(business.id);
  if (sendRefusal) {
    return { ok: false, error: sendRefusal };
  }

  const flip = await markFollowUpDraftSent({
    id: draftId,
    businessId: business.id,
    editedBody: editedBody && editedBody.length > 0 ? editedBody : undefined,
  });

  if (!flip.ok) {
    return { ok: false, error: flip.error };
  }

  let failure: string | null = null;
  // The provider can't say whether the message left (see SendFailureReason).
  let uncertain = false;
  let sent: {
    clientId: string;
    clientName: string | null;
    phone: string;
    result: Extract<SendMessageResult, { ok: true }>;
  } | null = null;

  try {
    // The flip checked the draft and committed; the message is only handed to the
    // provider after that, outside any transaction, so another request can
    // invalidate the draft in between — a cancelled slot reactivated or filled
    // (which expires its offer), a payment settled, a client booked or archived.
    // One more check, as late as it can be made: the flip's whole check again,
    // directly before the patient is contacted. The draft it returns is the one
    // to send, with its body and phone number as they are now (Codex #130).
    const ready = await confirmFollowUpDraftDispatch({ id: draftId, businessId: business.id });

    if (!ready.ok) {
      failure = ready.error;
    } else {
      const { draft } = ready;
      const phone = draft.phone;

      if (!phone) {
        failure = "This client has no phone number on file.";
      } else {
        const result = await sendMessage({
          channel: "WHATSAPP",
          businessId: business.id,
          to: phone,
          message: { kind: "freeform", body: editedBody && editedBody.length > 0 ? editedBody : draft.body },
          // A draft is sent at most once, so its id names the message: a send of
          // it that reaches the provider twice is still delivered only once.
          idempotencyKey: `follow-up:${draftId}`,
        });

        if (result.ok) {
          sent = { clientId: draft.clientId, clientName: draft.clientName, phone, result };
        } else if (result.reason === "delivery_uncertain") {
          uncertain = true;
        } else if (result.reason === "rate_limited") {
          failure = result.error;
        } else {
          failure = "Couldn't send this message. Try again.";
        }
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

  if (uncertain) {
    // The message may already be with the patient, so the draft must not go back
    // to Pending — a second Send could deliver it twice. It is recorded as sent
    // (a slot offer opens to Book and Declined), and staff are told to check the
    // chat. Nothing is mirrored to the Inbox: there is no confirmed message to
    // show. If recording fails, the hourly sweep settles it the same way
    // (settleInterruptedFollowUpSends).
    await markFollowUpDraftDelivered({ id: draftId, businessId: business.id }).catch((error) => {
      logger.error("A follow-up's delivery is uncertain and it couldn't be recorded as sent.", error, {
        businessId: business.id,
        draftId,
      });
    });
    revalidateFollowUpSurfaces();
    // ok: the draft is handled, so its row leaves the list; the notice is shown
    // by the list itself, since this row won't be there to show it.
    return { ok: true, notice: FOLLOW_UP_DELIVERY_UNCERTAIN_NOTICE };
  }

  if (!sent) {
    await revertFollowUpDraftToPending({ id: draftId, businessId: business.id });
    return { ok: false, error: failure ?? "Couldn't send this message. Try again." };
  }

  // The message left: only now is the draft sent, and a slot offer open to Book
  // and Declined (see DELIVERED_WHERE). Not fatal if it fails — the hourly sweep
  // settles a draft left marked as being sent (settleInterruptedFollowUpSends).
  await markFollowUpDraftDelivered({ id: draftId, businessId: business.id }).catch((error) => {
    logger.error("Sent a follow-up but couldn't record it as delivered.", error, { businessId: business.id, draftId });
  });

  // Best-effort Inbox mirror: the draft is already flipped to SENT and the
  // WhatsApp message already went out, so a failure here must not undo either.
  await mirrorOutboundToInbox({
    businessId: business.id,
    clientId: sent.clientId,
    clientName: sent.clientName,
    phone: sent.phone,
    result: sent.result,
    failureMessage: "Sent a follow-up draft but couldn't mirror it to the inbox.",
    logContext: { businessId: business.id, draftId },
  });

  revalidateFollowUpSurfaces();
  // The mirrored OUTBOUND message also lands on the client's activity
  // timeline and the Dashboard's Messages preview, same surfaces
  // sendInboxMessageAction revalidates for the same kind of write.
  revalidatePath("/dashboard");
  revalidatePath(`/clients/${sent.clientId}`);
  return { ok: true };
}

export type BookFollowUpSlotResult = { ok: true; bookingUrl: string } | { ok: false; error: string };

/**
 * Turns a sent slot-offer draft into a booking link pre-filled with the
 * client, service, staff member, and the freed slot's date and time (in the
 * clinic's zone). Only a live SENT SLOT_OFFER draft qualifies (mirrors
 * FollowUpDraftItem.canBook plus liveSlotOfferWhere) — anything else (not
 * found, wrong kind, still PENDING, already DISMISSED/EXPIRED, the slot has
 * passed) returns the same plain "no longer available" error, since none of
 * those cases are actionable here.
 *
 * The linked waitlist entry is flipped OFFERED -> FILLED right here (see
 * bookSlotOffer, which serializes with Skip/Declined/Remove on the draft row),
 * at the point staff commits to booking by clicking "Book" — not when the
 * booking form is actually saved. The calendar's saveAppointmentAction has no cheap
 * way today to know a given save originated from a waitlist offer (that would
 * mean threading a hidden waitlist-entry id through the booking form and its
 * save path), so flipping status at save time isn't simple. Flipping here
 * instead is slightly early — a staff member who clicks Book and then
 * abandons the form leaves the entry marked FILLED with no appointment — but
 * that gap is small and easy to recover from manually, versus the complexity
 * of threading state through an unrelated form. A future PR can tighten this
 * if it proves to matter in practice.
 */
export async function bookFollowUpSlotAction(rawDraftId: string): Promise<BookFollowUpSlotResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const business = context.business;
  const draftId = parseRecordId(rawDraftId);

  if (!draftId) {
    return { ok: false, error: SLOT_OFFER_UNAVAILABLE_ERROR };
  }

  // Book re-checks the offer and reads the slot under its locks, in the same
  // transaction that marks the entry FILLED, so the link below is built from
  // exactly what was booked - never a snapshot an edit or a deactivation made
  // stale in between (Codex #130). It refuses (leaving draft and entry as they
  // are) when the offer is gone, its clinician is no longer available, or the
  // slot no longer fits the clinic's hours.
  let booked;
  try {
    booked = await bookSlotOffer({ id: draftId, businessId: business.id });
  } catch (error) {
    // Already retried once on a write conflict (see retryOnWriteConflict).
    logger.error("Couldn't book a slot offer.", error, { businessId: business.id, draftId });
    return { ok: false, error: TRY_AGAIN_ERROR };
  }

  if (!booked.ok) {
    return booked;
  }

  const { clientId, title, staffMemberId, startAt, endAt } = booked.slot;

  const params = new URLSearchParams({
    client: clientId,
    service: title,
    date: formatZonedDateKey(startAt),
    time: formatZonedTime24(startAt),
  });
  // Always set the param, even when the freed appointment was genuinely
  // unassigned (empty string): the booking form's own "no id preselected"
  // default is staffMembers[0], which is indistinguishable from a real
  // clinician choice — an absent param and an explicit unassigned choice
  // must not collapse into the same state, or Book silently assigns the
  // slot to whichever clinician happens to be first (Codex #130). The page
  // treats an empty value as "unassigned" and any other value as a staff id
  // to validate, same as before.
  params.set("staffMemberId", staffMemberId ?? "");
  // Preserve the freed slot's own length — a 30-minute opening rebooked at the
  // form's 60-minute default could conflict with the next appointment, and a
  // longer one would be silently shortened (Codex). Measured on the clinic's
  // clock, not as elapsed time: the form adds this to the wall-clock start to get
  // the end time, so across a daylight-saving change the elapsed minutes would
  // derive an end time that is not the slot's - on the spring-forward night one
  // that does not exist at all (Codex #130).
  const durationMinutes = getZonedWallClockMinutesBetween(startAt, endAt);
  if (durationMinutes > 0) {
    params.set("duration", String(durationMinutes));
  }

  revalidateFollowUpSurfaces();

  return { ok: true, bookingUrl: `/calendar/new?${params.toString()}` };
}

/**
 * Skip. Skipping a slot offer also puts the client back on the waiting list
 * and offers the same slot to the next match (see dismissFollowUpDraft).
 */
export async function dismissFollowUpDraftAction(rawDraftId: string): Promise<FollowUpDraftActionResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  // A non-string id would dismiss every pending draft in the workspace.
  const draftId = parseRecordId(rawDraftId);

  if (!draftId) {
    return { ok: false, error: ALREADY_HANDLED_ERROR };
  }

  let outcome;
  try {
    outcome = await dismissFollowUpDraft({ id: draftId, businessId: context.business.id });
  } catch (error) {
    // Already retried once on a write conflict (see retryOnWriteConflict).
    logger.error("Couldn't skip a follow-up draft.", error, { businessId: context.business.id, draftId });
    return { ok: false, error: TRY_AGAIN_ERROR };
  }

  if (!outcome.ok) {
    return outcome;
  }

  revalidateFollowUpSurfaces();
  return { ok: true };
}

/**
 * "Declined": the patient turned down a sent slot offer. Puts them back on
 * the waiting list and offers the same slot to the next match (see
 * passSlotOffer). No plan check here, like Skip and Book: a workspace that
 * dropped to Basic must still be able to release an outstanding offer. The
 * re-offer half is Pro-gated inside offerFreedSlot, so Basic drafts nothing.
 */
export async function passSlotOfferAction(rawDraftId: string): Promise<FollowUpDraftActionResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const business = context.business;
  const draftId = parseRecordId(rawDraftId);

  if (!draftId) {
    return { ok: false, error: SLOT_OFFER_UNAVAILABLE_ERROR };
  }

  let outcome;
  try {
    outcome = await passSlotOffer({ id: draftId, businessId: business.id });
  } catch (error) {
    // Already retried once on a write conflict (see retryOnWriteConflict).
    logger.error("Couldn't record a declined slot offer.", error, { businessId: business.id, draftId });
    return { ok: false, error: TRY_AGAIN_ERROR };
  }

  if (!outcome.ok) {
    return outcome;
  }

  revalidateFollowUpSurfaces();
  return { ok: true };
}
