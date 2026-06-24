"use server";

import { z } from "zod";

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
import { sendMessage } from "@/lib/messaging";
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

export type ConvertConversationToClientResult = {
  ok: boolean;
  error?: string;
  conversation?: InboxConversation;
  clientId?: string;
};

function getAuthedBusiness() {
  return getAuthedBusinessContext(
    "Your session expired. Log in again to manage the inbox."
  );
}

async function hydrateConversation(conversationId: string, businessId: string) {
  const [conversation, clients] = await Promise.all([
    prisma.conversation.findFirstOrThrow({
      where: {
        id: conversationId,
        businessId,
      },
      select: {
        id: true,
        phoneNumber: true,
        contactName: true,
        unreadCount: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            direction: true,
            body: true,
            deliveryStatus: true,
            sentAt: true,
          },
          orderBy: {
            sentAt: "desc",
          },
          take: 50,
        },
      },
    }),
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
  ]);

  return buildInboxConversation(conversation, clients);
}

async function loadInboxView(businessId: string) {
  const [clients, conversations] = await Promise.all([
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
    prisma.conversation.findMany({
      where: {
        businessId,
      },
      select: {
        id: true,
        phoneNumber: true,
        contactName: true,
        unreadCount: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            direction: true,
            body: true,
            deliveryStatus: true,
            sentAt: true,
          },
          orderBy: {
            sentAt: "desc",
          },
          take: 50,
        },
      },
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: 50,
    }),
  ]);

  return buildInboxViewFromWorkspace({
    conversations,
    clients,
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

export async function markConversationReadAction(
  conversationId: string
): Promise<MarkConversationReadResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
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
      error: "Conversation not found in this clinic workspace.",
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

  return {
    ok: true,
    conversationId,
  };
}

export async function sendInboxMessageAction(
  conversationId: string,
  body: string
): Promise<SendInboxMessageResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
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
      error: "Conversation not found in this clinic workspace.",
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

  // All outbound WhatsApp flows through the messaging seam, which routes to the
  // active provider (Baileys), renders/validates the payload, never throws, and
  // returns the exact body it sent for storage.
  const result = await sendMessage({
    channel: "WHATSAPP",
    businessId: context.business.id,
    to: conversation.phoneNumber,
    message: { kind: "freeform", body: cleanedBody },
  });

  if (!result.ok) {
    logger.error("WhatsApp outbound send failed.", undefined, {
      businessId: context.business.id,
      conversationId,
      reason: result.reason,
    });
    // Only a genuine provider/connection failure flags the clinic's shared
    // connection as errored. A bad recipient or empty body is a per-message
    // problem — marking the whole connection ERRORED for it would wrongly
    // signal the WhatsApp link is down and churn the Settings status.
    if (result.reason === "provider_error") {
      await prisma.whatsAppConnection.update({
        where: { businessId: context.business.id },
        data: { status: "ERRORED", lastSyncedAt: new Date() },
      });
    }
    return {
      ok: false,
      // Surface the specific, customer-safe copy for a too-long message; keep the
      // generic line for genuine provider/connection failures.
      error:
        result.reason === "message_too_long"
          ? result.error
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

  return {
    ok: true,
    conversation: await hydrateConversation(
      conversation.id,
      context.business.id
    ),
  };
}

export async function deleteConversationAction(
  conversationId: string
): Promise<DeleteConversationResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
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
      error: "Conversation not found in this clinic workspace.",
    };
  }

  await prisma.conversation.delete({
    where: {
      id: conversationId,
    },
  });

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
  conversationId: string,
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
      error: "Conversation not found in this clinic workspace.",
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

  return {
    ok: true,
    clientId,
    conversation: await hydrateConversation(conversation.id, businessId),
  };
}
