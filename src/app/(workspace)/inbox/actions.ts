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
import {
  getConfiguredTwilioFirstMessageTemplateSid,
  sendTwilioWhatsAppMessage,
  sendTwilioWhatsAppTemplateMessage,
} from "@/lib/whatsapp";
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
      messages: {
        where: {
          direction: "INBOUND",
        },
        orderBy: {
          sentAt: "desc",
        },
        take: 1,
        select: {
          sentAt: true,
        },
      },
    },
  });

  if (!conversation) {
    return {
      ok: false,
      error: "Conversation not found in this clinic workspace.",
    };
  }

  const [clients] = await Promise.all([
    prisma.client.findMany({
      where: {
        businessId: context.business.id,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    }),
  ]);
  const whatsAppConnection = await syncWhatsAppConnectionForBusiness(
    context.business.id
  );
  const matchedClient = clients.find(
    (client) => phoneLookupKey(client.phone) === phoneLookupKey(conversation.phoneNumber)
  );

  if (!whatsAppConnection || whatsAppConnection.status !== "CONNECTED") {
    return {
      ok: false,
      error:
        "WhatsApp is not connected for this clinic yet. Complete the clinic connection in Settings first.",
    };
  }

  const senderPhoneNumber = whatsAppConnection.senderPhoneNumber?.trim() || "";

  if (!senderPhoneNumber) {
    return {
      ok: false,
      error:
        "This clinic does not have an active WhatsApp sender yet. Finish the clinic connection in Settings first.",
    };
  }

  let delivery:
    | {
        sid: string;
        status: string;
      }
    | undefined;

  const latestInboundAt = conversation.messages[0]?.sentAt ?? null;
  const hasOpenFreeformWindow =
    latestInboundAt !== null &&
    Date.now() - latestInboundAt.getTime() <= 24 * 60 * 60 * 1000;
  const firstMessageTemplateSid = getConfiguredTwilioFirstMessageTemplateSid();
  const senderDisplayName =
    typeof context.user.user_metadata?.full_name === "string" &&
    context.user.user_metadata.full_name.trim().length > 0
      ? context.user.user_metadata.full_name.trim()
      : `${context.business.name} team`;
  const renderedTemplateBody = `Hello ${matchedClient?.name ?? conversation.contactName ?? "there"}, this is ${senderDisplayName} from ${context.business.name}. You can reply here on WhatsApp to continue the conversation.`;
  const outboundBody =
    !hasOpenFreeformWindow && firstMessageTemplateSid
      ? renderedTemplateBody
      : cleanedBody;

  try {
    if (!hasOpenFreeformWindow && firstMessageTemplateSid) {
      delivery = await sendTwilioWhatsAppTemplateMessage({
        to: conversation.phoneNumber,
        from: senderPhoneNumber,
        contentSid: firstMessageTemplateSid,
        contentVariables: {
          "1": matchedClient?.name ?? conversation.contactName ?? "there",
          "2": senderDisplayName,
          "3": context.business.name,
        },
      });
    } else {
      delivery = await sendTwilioWhatsAppMessage({
        to: conversation.phoneNumber,
        body: cleanedBody,
        from: senderPhoneNumber,
      });
    }
  } catch (error) {
    logger.error("WhatsApp outbound send failed.", error, {
      businessId: context.business.id,
      conversationId,
    });

    await prisma.whatsAppConnection.update({
      where: {
        businessId: context.business.id,
      },
      data: {
        status: "ERRORED",
        lastSyncedAt: new Date(),
      },
    });

    return {
      ok: false,
      error: "We couldn't send the WhatsApp message.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId: conversation.id,
        clientId: matchedClient?.id ?? null,
        direction: "OUTBOUND",
        body: outboundBody,
        providerMessageSid: delivery?.sid || null,
        deliveryStatus:
          delivery?.status === "sent"
            ? "SENT"
            : delivery?.status === "delivered"
              ? "DELIVERED"
              : delivery?.status === "read"
                ? "READ"
                : delivery?.status === "failed" || delivery?.status === "undelivered"
                  ? "FAILED"
                  : "QUEUED",
        deliveryUpdatedAt: new Date(),
      },
    });

    await tx.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        contactName: matchedClient?.name ?? conversation.contactName,
        unreadCount: 0,
      },
    });

    await tx.whatsAppConnection.update({
      where: {
        businessId: context.business.id,
      },
      data: {
        status: "CONNECTED",
        lastSyncedAt: new Date(),
      },
    });
  });

  return {
    ok: true,
    conversation: await hydrateConversation(conversation.id, context.business.id),
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

  const existingClients = await prisma.client.findMany({
    where: {
      businessId,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  });

  const matchedClient = existingClients.find(
    (client) => phoneLookupKey(client.phone) === phoneLookupKey(conversation.phoneNumber)
  );

  if (!matchedClient && !cleanedName) {
    return {
      ok: false,
      error: "Client name is required to convert this thread.",
    };
  }

  const normalizedPhone = normalizePhone(conversation.phoneNumber) || conversation.phoneNumber.trim();

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
          preferredChannel: "WhatsApp",
        },
        update: {},
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
