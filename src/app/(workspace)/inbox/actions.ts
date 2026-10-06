"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { manualSendRefusal } from "@/lib/messaging/send-limits";
import { prisma } from "@/lib/prisma";
import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import { logger } from "@/lib/logger";
import {
  buildInboxConversation,
  buildInboxViewFromWorkspace,
  normalizePhone,
  phoneLookupKey,
  type InboxConversation,
  type InboxViewModel,
} from "@/lib/inbox";
import { conversationSelect, fetchInboxConversations, RECENT_MESSAGE_LIMIT } from "@/lib/inbox-server";
import { sendMessage } from "@/lib/messaging";
import { parseRecordId } from "@/lib/record-id";
import { syncWhatsAppConnectionForBusiness } from "@/lib/whatsapp-connection";

export type SendInboxMessageResult = {
  ok: boolean;
  error?: string;
  conversation?: InboxConversation;
};

export type MarkConversationReadResult = {
  ok: boolean;
  error?: string;
  conversationId?: string;
};

export type DeleteConversationResult = {
  ok: boolean;
  error?: string;
  conversationId?: string;
};

export type RefreshInboxResult = {
  ok: boolean;
  error?: string;
  view?: InboxViewModel;
};

export type HydrateConversationResult = {
  ok: boolean;
  error?: string;
  conversation?: InboxConversation;
};

export type ConvertConversationToClientResult = {
  ok: boolean;
  error?: string;
  conversation?: InboxConversation;
  clientId?: string;
};

const CONVERSATION_NOT_FOUND_ERROR = "Conversation not found in this clinic workspace.";
const INBOX_DELIVERY_UNCERTAIN_ERROR =
  "We couldn't confirm this message was delivered. It may have reached the patient, so check the WhatsApp chat before sending it again.";

function getAuthedBusiness() {
  return getAuthedBusinessContext(
    "Your session expired. Log in again to manage the inbox."
  );
}

async function hydrateConversation(conversationId: string, businessId: string) {
  const conversation = await prisma.conversation.findFirstOrThrow({
    where: {
      id: conversationId,
      businessId,
    },
    select: conversationSelect(RECENT_MESSAGE_LIMIT),
  });

  // Indexed match on the canonical digit key instead of scanning the whole
  // client table for one conversation's link (same pattern already used by
  // sendInboxMessageAction/deleteConversationAction/convertConversationToClientAction).
  const conversationPhoneKey = phoneLookupKey(conversation.phoneNumber);
  const matchedClient = conversationPhoneKey
    ? await prisma.client.findFirst({
        where: {
          businessId,
          phoneKey: conversationPhoneKey,
        },
        select: {
          id: true,
          name: true,
          phone: true,
        },
      })
    : null;

  return buildInboxConversation(conversation, matchedClient ? [matchedClient] : []);
}

async function loadInboxView(businessId: string) {
  const [clients, { conversations, totalUnreadCount }] = await Promise.all([
    prisma.client.findMany({
      where: {
        businessId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: 150,
    }),
    fetchInboxConversations(businessId),
  ]);

  return buildInboxViewFromWorkspace({
    conversations,
    clients,
    totalUnreadCount,
  });
}

export async function refreshInboxAction(): Promise<RefreshInboxResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  return {
    ok: true,
    view: await loadInboxView(context.business.id),
  };
}

/**
 * Fetches a conversation's full message thread — used when the operator
 * opens one that fetchInboxConversations only loaded as an "extra unread"
 * preview (hasFullHistory: false), so its thread view never renders a
 * silently-truncated 1-message history.
 */
export async function hydrateConversationAction(
  rawConversationId: string
): Promise<HydrateConversationResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const conversationId = parseRecordId(rawConversationId);

  if (!conversationId) {
    return { ok: false, error: CONVERSATION_NOT_FOUND_ERROR };
  }

  return {
    ok: true,
    conversation: await hydrateConversation(conversationId, context.business.id),
  };
}

export async function markConversationReadAction(
  rawConversationId: string
): Promise<MarkConversationReadResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const conversationId = parseRecordId(rawConversationId);

  if (!conversationId) {
    return { ok: false, error: CONVERSATION_NOT_FOUND_ERROR };
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      businessId: context.business.id,
    },
    select: {
      id: true,
    },
  });

  if (!conversation) {
    return {
      ok: false,
      error: CONVERSATION_NOT_FOUND_ERROR,
    };
  }

  await prisma.conversation.update({
    where: {
      id: conversationId,
    },
    data: {
      unreadCount: 0,
    },
  });

  // The dashboard's unread-messages KPI + Messages preview badges read this count.
  revalidatePath("/dashboard");

  return {
    ok: true,
    conversationId,
  };
}

export async function sendInboxMessageAction(
  rawConversationId: string,
  body: string
): Promise<SendInboxMessageResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const conversationId = parseRecordId(rawConversationId);

  if (!conversationId) {
    return { ok: false, error: CONVERSATION_NOT_FOUND_ERROR };
  }

  const cleanedBody = body.trim();

  if (!cleanedBody) {
    return {
      ok: false,
      error: "Write a message before sending.",
    };
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      businessId: context.business.id,
    },
    select: {
      id: true,
      phoneNumber: true,
      contactName: true,
    },
  });

  if (!conversation) {
    return {
      ok: false,
      error: CONVERSATION_NOT_FOUND_ERROR,
    };
  }

  // Resolve the linked client by the canonical digit key (indexed) instead of
  // pulling the whole client table to JS-match one phone.
  const conversationPhoneKey = phoneLookupKey(conversation.phoneNumber);
  const [matchedClient, whatsAppConnection] = await Promise.all([
    conversationPhoneKey
      ? prisma.client.findFirst({
          where: {
            businessId: context.business.id,
            phoneKey: conversationPhoneKey,
          },
          select: {
            id: true,
            name: true,
          },
        })
      : null,
    syncWhatsAppConnectionForBusiness(context.business.id),
  ]);

  if (!whatsAppConnection || whatsAppConnection.status !== "CONNECTED") {
    return {
      ok: false,
      error:
        "WhatsApp is not connected for this clinic yet. Complete the clinic connection in Settings first.",
    };
  }

  const sendRefusal = await manualSendRefusal(context.business.id);
  if (sendRefusal) {
    return { ok: false, error: sendRefusal };
  }

  // All outbound WhatsApp flows through the messaging seam, which routes to the
  // active provider (Baileys), renders/validates the payload, never throws, and
  // returns the exact body it sent for storage.
  //
  // Deliberately unkeyed (no idempotencyKey): a manual reply has no record id
  // of its own, and a per-compose key would hold an uncertain send for hours,
  // so staff who checked the chat and saw it never arrived couldn't send it
  // again. Instead an uncertain send says so (below), and the person decides.
  const result = await sendMessage({
    channel: "WHATSAPP",
    businessId: context.business.id,
    to: conversation.phoneNumber,
    message: { kind: "freeform", body: cleanedBody },
  });

  if (!result.ok) {
    // The clinic's sending ceiling refusing a send is the limiter working, not
    // a fault: a warning, not an error report (Codex #136).
    const failureContext = { businessId: context.business.id, conversationId, reason: result.reason };
    if (result.reason === "rate_limited") {
      logger.warn("WhatsApp outbound send held back by the clinic's sending ceiling.", failureContext);
    } else {
      logger.error("WhatsApp outbound send failed.", undefined, failureContext);
    }
    // Only a genuine provider/connection failure flags the clinic's shared
    // connection as errored. A bad recipient or empty body is a per-message
    // problem — marking the whole connection ERRORED for it would wrongly
    // signal the WhatsApp link is down and churn the Settings status. An
    // uncertain send counts: it means the link stalled mid-send.
    if (result.reason === "provider_error" || result.reason === "delivery_uncertain") {
      await prisma.whatsAppConnection.update({
        where: { businessId: context.business.id },
        data: { status: "ERRORED", lastSyncedAt: new Date() },
      });
    }
    return {
      ok: false,
      // Surface the specific, customer-safe copy for a too-long message and for
      // a send that may have gone out anyway (so it isn't simply sent again);
      // keep the generic line for genuine provider/connection failures.
      error:
        result.reason === "message_too_long" || result.reason === "rate_limited"
          ? result.error
          : result.reason === "delivery_uncertain"
            ? INBOX_DELIVERY_UNCERTAIN_ERROR
            : "We couldn't send the WhatsApp message.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId: conversation.id,
        clientId: matchedClient?.id ?? null,
        direction: "OUTBOUND",
        body: result.body,
        providerMessageSid: result.providerMessageId,
        deliveryStatus: result.status,
        deliveryUpdatedAt: new Date(),
      },
    });

    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        contactName: matchedClient?.name ?? conversation.contactName,
        unreadCount: 0,
      },
    });

    await tx.whatsAppConnection.update({
      where: { businessId: context.business.id },
      data: { status: "CONNECTED", lastSyncedAt: new Date() },
    });
  });

  // The dashboard's unread KPI + Messages preview reflect this thread; refresh
  // their cached payloads so they don't lag the send. When the thread is linked
  // to a client, the outbound message also lands on that client's activity
  // timeline, so refresh their profile too.
  revalidatePath("/dashboard");
  if (matchedClient) {
    revalidatePath(`/clients/${matchedClient.id}`);
  }

  return {
    ok: true,
    conversation: await hydrateConversation(
      conversation.id,
      context.business.id
    ),
  };
}

export async function deleteConversationAction(
  rawConversationId: string
): Promise<DeleteConversationResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  // A non-string id would delete every conversation in the workspace.
  const conversationId = parseRecordId(rawConversationId);

  if (!conversationId) {
    return { ok: false, error: CONVERSATION_NOT_FOUND_ERROR };
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      businessId: context.business.id,
    },
    select: {
      id: true,
      phoneNumber: true,
    },
  });

  if (!conversation) {
    return {
      ok: false,
      error: CONVERSATION_NOT_FOUND_ERROR,
    };
  }

  // Resolve a linked client (by the canonical phone key) before deleting so we
  // can refresh their profile timeline — the cascade removes messages that show
  // on the client detail page.
  const conversationPhoneKey = phoneLookupKey(conversation.phoneNumber);
  const linkedClient = conversationPhoneKey
    ? await prisma.client.findFirst({
        where: {
          businessId: context.business.id,
          phoneKey: conversationPhoneKey,
        },
        select: { id: true },
      })
    : null;

  // Compare-and-set: scope the delete by the same id/businessId used to find
  // the row above, so a concurrent delete of this same conversation can't
  // make `.delete` throw Prisma's P2025 — it's just a typed not-found
  // instead, same class of race already closed for appointments/clients/staff.
  const { count } = await prisma.conversation.deleteMany({
    where: {
      id: conversationId,
      businessId: context.business.id,
    },
  });

  if (count === 0) {
    return {
      ok: false,
      error: CONVERSATION_NOT_FOUND_ERROR,
    };
  }

  revalidatePath("/dashboard");
  if (linkedClient) {
    revalidatePath(`/clients/${linkedClient.id}`);
  }

  return {
    ok: true,
    conversationId,
  };
}

const convertConversationSchema = z.object({
  name: z.string().max(160).optional().default(""),
  // Trim before validating so an email typed with surrounding whitespace (which
  // the previous trim-then-store path accepted) still validates and converts.
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([z.string().max(254).email(), z.literal("")]).optional()
  ),
});

export async function convertConversationToClientAction(
  rawConversationId: string,
  payload: {
    name: string;
    email?: string;
  }
): Promise<ConvertConversationToClientResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const conversationId = parseRecordId(rawConversationId);

  if (!conversationId) {
    return { ok: false, error: CONVERSATION_NOT_FOUND_ERROR };
  }

  const businessId = context.business.id;

  const parsed = convertConversationSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Enter a valid name (and email, if provided) to convert this thread.",
    };
  }

  const cleanedName = parsed.data.name.trim();
  const cleanedEmail = parsed.data.email?.trim() || null;

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      businessId,
    },
    select: {
      id: true,
      phoneNumber: true,
      contactName: true,
    },
  });

  if (!conversation) {
    return {
      ok: false,
      error: CONVERSATION_NOT_FOUND_ERROR,
    };
  }

  // Indexed match on the canonical digit key instead of scanning all clients.
  const conversationPhoneKey = phoneLookupKey(conversation.phoneNumber);
  const matchedClient = conversationPhoneKey
    ? await prisma.client.findFirst({
        where: {
          businessId,
          phoneKey: conversationPhoneKey,
        },
        select: {
          id: true,
          name: true,
        },
      })
    : null;

  if (!matchedClient && !cleanedName) {
    return {
      ok: false,
      error: "Client name is required to convert this thread.",
    };
  }

  const normalizedPhone = normalizePhone(conversation.phoneNumber) || conversation.phoneNumber.trim();
  const normalizedPhoneKey = phoneLookupKey(conversation.phoneNumber) || null;

  const clientId = await prisma.$transaction(async (tx) => {
    let resolvedClientId = matchedClient?.id;
    let resolvedClientName = matchedClient?.name ?? cleanedName;

    if (!resolvedClientId) {
      // Upsert on the (businessId, phone) unique key so two concurrent
      // conversions of the same thread can't create duplicate clients —
      // the second one resolves to the row the first just created.
      const resolved = await tx.client.upsert({
        where: {
          businessId_phone: {
            businessId,
            phone: normalizedPhone,
          },
        },
        create: {
          businessId,
          name: cleanedName,
          email: cleanedEmail,
          phone: normalizedPhone,
          phoneKey: normalizedPhoneKey,
          preferredChannel: "WhatsApp",
        },
        // Self-heal: if a legacy client row matched by phone but had a NULL
        // phoneKey (created before the backfill / by older code), populate it so
        // the indexed lookups can find it. Otherwise leave the row untouched.
        update: {
          phoneKey: normalizedPhoneKey,
        },
        select: {
          id: true,
          name: true,
        },
      });

      resolvedClientId = resolved.id;
      resolvedClientName = resolved.name;
    }

    await tx.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        contactName: resolvedClientName,
      },
    });

    await tx.message.updateMany({
      where: {
        conversationId: conversation.id,
      },
      data: {
        clientId: resolvedClientId,
      },
    });

    return resolvedClientId;
  });

  // A client now exists/changed and the thread's messages were reassigned to it.
  // Refresh the directory, dashboard, the Reports New-clients KPI, and the
  // client's own profile timeline so none lag a manual reload.
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath(`/clients/${clientId}`);

  return {
    ok: true,
    clientId,
    conversation: await hydrateConversation(conversation.id, businessId),
  };
}
