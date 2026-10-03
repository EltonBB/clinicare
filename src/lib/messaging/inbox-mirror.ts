import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import type { SendMessageResult } from "./types";

/**
 * Mirrors an outbound WhatsApp message the app just sent into the client's
 * Inbox thread — same shape as reminders.ts's own inbox mirror and
 * inbox/actions.ts's sendInboxMessageAction: upsert the Conversation by its
 * (businessId, phoneKey) key, then create the OUTBOUND Message carrying the
 * provider id/delivery status, so a later delivery-status webhook
 * (recordDeliveryStatus) has a row to match against instead of silently
 * dropping the receipt.
 *
 * Best-effort by design: the message already went out (and the caller's own
 * state change already committed) by the time this runs, so a failure here
 * must not fail or undo either — only the Inbox mirror is lost, and it is
 * logged with `failureMessage` and `logContext` (record ids only, never the
 * message body or a phone number).
 */
export async function mirrorOutboundToInbox(args: {
  businessId: string;
  clientId: string;
  clientName: string | null;
  phone: string;
  result: Extract<SendMessageResult, { ok: true }>;
  failureMessage: string;
  logContext: Record<string, string>;
}) {
  const { businessId, clientId, clientName, phone, result, failureMessage, logContext } = args;
  const phoneKey = phoneLookupKey(phone);
  if (!phoneKey) {
    return;
  }
  const normalizedPhone = normalizePhone(phone);

  try {
    await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: {
          businessId_phoneKey: { businessId, phoneKey },
        },
        update: {
          contactName: clientName || undefined,
        },
        create: {
          businessId,
          phoneNumber: normalizedPhone,
          phoneKey,
          contactName: clientName || normalizedPhone,
          unreadCount: 0,
        },
        select: { id: true },
      });

      await tx.message.create({
        data: {
          conversationId: conversation.id,
          clientId,
          direction: "OUTBOUND",
          body: result.body,
          providerMessageSid: result.providerMessageId,
          deliveryStatus: result.status,
          deliveryUpdatedAt: new Date(),
        },
      });
    });
  } catch (error) {
    logger.error(failureMessage, error, logContext);
  }
}
