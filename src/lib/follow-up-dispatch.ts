import type { Prisma } from "@prisma/client";

import { FOLLOW_UP_KIND_TO_AUTOMATION } from "@/lib/automations";
import {
  confirmFollowUpDraftDispatch,
  markFollowUpDraftDelivered,
  markFollowUpDraftSent,
  revertFollowUpDraftToPending,
} from "@/lib/follow-ups-data";
import { getAutomationsCursor, setAutomationsCursor } from "@/lib/follow-up-cursor";
import { logger } from "@/lib/logger";
import { sendMessage } from "@/lib/messaging";
import { mirrorOutboundToInbox } from "@/lib/messaging/inbox-mirror";
import type { SendMessageResult } from "@/lib/messaging/types";
import { prisma } from "@/lib/prisma";
import { lastAttemptedId, rotateForFairness } from "@/lib/reminder-fairness";

export const FOLLOW_UP_DELIVERY_UNCERTAIN_NOTICE =
  "We couldn't confirm a follow-up was delivered, so it was marked as sent. Check the patient's WhatsApp chat before contacting them again.";
const TRY_AGAIN_ERROR = "Couldn't send this message. Try again.";

export type DispatchResult =
  | { ok: true; clientId: string | null; notice?: string }
  /**
   * `retryable`: the same send could work on a later try (the provider was
   * down, a lookup threw). False when it never will as things stand: the
   * draft was refused (switched off, no longer true) or the message itself
   * can't be sent (no or an invalid phone number, empty or too long).
   */
  | { ok: false; error: string; rateLimited?: boolean; retryable: boolean };

/** Send failures a retry can't fix: the recipient or the message itself is the problem. */
const PERMANENT_SEND_FAILURES = new Set(["invalid_recipient", "empty_message", "message_too_long"]);

/**
 * Sends one follow-up draft: claims it (PENDING -> SENT, liveness re-checked in
 * the same write), checks it once more directly before the patient is
 * contacted, sends it through the messaging seam, then records the outcome.
 * Any failure past the claim puts the draft back to PENDING so it can be
 * retried — except a send whose delivery is uncertain, which may already be
 * with the patient and is recorded as sent instead (never retried).
 *
 * Used by Send in the review list (staff) and by the automatic sends of
 * `autoSend` drafts. `editedBody` is the text staff approved in the list.
 */
export async function dispatchFollowUpDraft(args: {
  draftId: string;
  businessId: string;
  editedBody?: string;
  /** Sent without a person: the draft must still be marked to send on its own at every check. */
  automatic?: boolean;
}): Promise<DispatchResult> {
  const { draftId, businessId, editedBody, automatic } = args;

  const flip = await markFollowUpDraftSent({ id: draftId, businessId, editedBody, automatic });
  if (!flip.ok) {
    return { ok: false, error: flip.error, retryable: false };
  }

  let failure: string | null = null;
  let rateLimited = false;
  let retryable = false;
  // The provider can't say whether the message left (see SendFailureReason).
  let uncertain = false;
  let sent: {
    clientId: string;
    clientName: string | null;
    phone: string;
    kind: keyof typeof FOLLOW_UP_KIND_TO_AUTOMATION;
    result: Extract<SendMessageResult, { ok: true }>;
  } | null = null;

  try {
    // The claim committed; the message is handed to the provider only after,
    // outside any transaction, so another request can invalidate the draft in
    // between (a slot filled, a payment settled, a client booked or archived).
    // One more check, as late as it can be made (Codex #130).
    const ready = await confirmFollowUpDraftDispatch({ id: draftId, businessId, automatic });

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
          businessId,
          to: phone,
          message: { kind: "freeform", body: editedBody ?? draft.body },
          // A draft is sent at most once, so its id names the message: a send of
          // it that reaches the provider twice is still delivered only once.
          idempotencyKey: `follow-up:${draftId}`,
        });

        if (result.ok) {
          sent = { clientId: draft.clientId, clientName: draft.clientName, phone, kind: draft.kind, result };
        } else if (result.reason === "delivery_uncertain") {
          uncertain = true;
        } else if (result.reason === "rate_limited") {
          failure = result.error;
          rateLimited = true;
          retryable = true;
        } else {
          failure = TRY_AGAIN_ERROR;
          retryable = !PERMANENT_SEND_FAILURES.has(result.reason);
        }
      }
    }
  } catch (error) {
    // A lookup that throws means nothing was sent, so put the draft back rather
    // than strand it as SENT (every retry would answer "already handled").
    logger.error("A follow-up send failed after the draft was marked sent.", error, { businessId, draftId });
    failure = TRY_AGAIN_ERROR;
    retryable = true;
  }

  if (uncertain) {
    // May already be with the patient: never back to Pending (a second send
    // could deliver it twice). Recorded as sent; if that fails the hourly sweep
    // settles it (settleInterruptedFollowUpSends). Nothing to mirror.
    await markFollowUpDraftDelivered({ id: draftId, businessId }).catch((error) => {
      logger.error("A follow-up's delivery is uncertain and it couldn't be recorded as sent.", error, {
        businessId,
        draftId,
      });
    });
    return { ok: true, clientId: null, notice: FOLLOW_UP_DELIVERY_UNCERTAIN_NOTICE };
  }

  if (!sent) {
    await revertFollowUpDraftToPending({ id: draftId, businessId });
    return { ok: false, error: failure ?? TRY_AGAIN_ERROR, rateLimited, retryable };
  }

  // Only now is the draft delivered (see DELIVERED_WHERE). Not fatal if it
  // fails — the hourly sweep settles a draft left marked as being sent.
  await markFollowUpDraftDelivered({ id: draftId, businessId }).catch((error) => {
    logger.error("Sent a follow-up but couldn't record it as delivered.", error, { businessId, draftId });
  });

  // Best-effort Inbox mirror: the message already went out.
  await mirrorOutboundToInbox({
    businessId,
    clientId: sent.clientId,
    clientName: sent.clientName,
    phone: sent.phone,
    result: sent.result,
    source: "FOLLOW_UP",
    automationKind: FOLLOW_UP_KIND_TO_AUTOMATION[sent.kind],
    failureMessage: "Sent a follow-up draft but couldn't mirror it to the inbox.",
    logContext: { businessId, draftId },
  });

  return { ok: true, clientId: sent.clientId };
}

/** Automatic sends wait this long after a draft is made, so `after()` gets the first go at it. */
const AUTO_SEND_GRACE_MS = 60_000;
/**
 * An automatic draft still unsent this long after it was made (WhatsApp was
 * down, the provider kept failing) is stale: it goes to review instead of
 * reaching the patient days late. Same 3 days as the generators' backlog rule.
 */
const AUTO_SEND_MAX_AGE_MS = 3 * 24 * 3_600_000;
/** Most automatic sends per clinic per run: a backlog drains over a few runs, never as one burst. */
const AUTO_SEND_PER_BUSINESS_CAP = 20;


/**
 * Sends the `autoSend` drafts that are due: made at least a minute ago (the
 * request that made one normally sends it at once via `after()`), past any
 * `sendAfter`, in a workspace whose WhatsApp is linked. Whether each one may
 * still go out — the automation on, the plan including it, what it is about
 * still true — is checked by the claim itself, so a draft that no longer
 * qualifies is simply left alone. Runs inside the every-5-minute reminders
 * cron and stops at `deadlineAt`. Logs ids and counts only.
 */
export async function dispatchDueAutomaticDrafts(args: {
  now: Date;
  deadlineAt: number;
  perBusinessCap?: number;
}): Promise<{ sent: number; failed: number }> {
  const { now, deadlineAt, perBusinessCap = AUTO_SEND_PER_BUSINESS_CAP } = args;

  const staleBefore = new Date(now.getTime() - AUTO_SEND_MAX_AGE_MS);
  await prisma.followUpDraft.updateMany({
    where: { status: "PENDING", autoSend: true, createdAt: { lt: staleBefore } },
    data: { autoSend: false },
  });

  const dueWhere = {
    status: "PENDING",
    autoSend: true,
    createdAt: { lte: new Date(now.getTime() - AUTO_SEND_GRACE_MS), gte: staleBefore },
    OR: [{ sendAfter: null }, { sendAfter: { lte: now } }],
    business: {
      whatsappEnabled: true,
      whatsappConnection: { is: { status: { in: ["CONNECTED", "ERRORED"] } } },
    },
  } satisfies Prisma.FollowUpDraftWhereInput;

  // Per clinic, not one global oldest-first batch: a clinic with a big queue
  // must not keep another clinic's messages out of every run. Clinics are
  // served in a rotation that resumes after the last one this run reached, so
  // a run that runs out of time never leaves the same clinics behind again.
  const groups = await prisma.followUpDraft.groupBy({
    by: ["businessId"],
    where: dueWhere,
    orderBy: { businessId: "asc" },
  });
  const businesses = rotateForFairness(
    groups.map((group) => ({ id: group.businessId })),
    await getAutomationsCursor()
  );

  let sent = 0;
  let failed = 0;
  let reached = 0;

  for (const business of businesses) {
    if (Date.now() > deadlineAt) break;
    reached += 1;
    const drafts = await prisma.followUpDraft.findMany({
      where: { ...dueWhere, businessId: business.id },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: perBusinessCap,
    });
    const outcome = await sendClinicDrafts(business.id, drafts, deadlineAt);
    sent += outcome.sent;
    failed += outcome.failed;
  }

  const lastReached = lastAttemptedId(businesses, reached);
  if (lastReached) await setAutomationsCursor(lastReached);

  return { sent, failed };
}

/** One clinic's due drafts, oldest first; stops at its sending ceiling or the deadline. */
async function sendClinicDrafts(
  businessId: string,
  drafts: { id: string }[],
  deadlineAt: number
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const { id: draftId } of drafts) {
    if (Date.now() > deadlineAt) break;

    try {
      const result = await dispatchFollowUpDraft({ draftId, businessId, automatic: true });
      if (result.ok) {
        sent += 1;
      } else if (result.rateLimited) {
        // At its sending ceiling: the rest of this clinic's drafts wait for the next run.
        failed += 1;
        break;
      } else {
        failed += 1;
        if (!result.retryable) {
          // Refused for a reason a retry won't fix (switched off, no longer
          // true, no or an invalid phone number): stop sending it on its own, so it can't
          // hold one of this clinic's places in every run. It stays visible in
          // To review wherever the review list would still show it.
          await prisma.followUpDraft
            .updateMany({ where: { id: draftId, status: "PENDING", autoSend: true }, data: { autoSend: false } })
            .catch((error) =>
              logger.error("Couldn't stop an unsendable draft from sending on its own.", error, { businessId, draftId })
            );
        }
      }
    } catch (error) {
      failed += 1;
      logger.error("An automatic follow-up send failed.", error, { businessId, draftId });
    }
  }

  return { sent, failed };
}
