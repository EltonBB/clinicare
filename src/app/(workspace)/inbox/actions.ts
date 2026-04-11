"use server";

import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business";
import {
  buildInboxConversation,
  buildInboxViewFromWorkspace,
  phoneLookupKey,
  type InboxConversation,
  type InboxViewModel,
} from "@/lib/inbox";
import { sendTwilioWhatsAppMessage } from "@/lib/whatsapp";
import { createClient } from "@/utils/supabase/server";

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

async function getAuthedBusiness() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Your session expired. Log in again to manage the inbox.",
    } as const;
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  return { business } as const;
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
            sentAt: "asc",
          },
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
            sentAt: "asc",
          },
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

  const [clients, whatsAppConnection] = await Promise.all([
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
    prisma.whatsAppConnection.findUnique({
      where: {
        businessId: context.business.id,
      },
      select: {
        id: true,
        status: true,
      },
    }),
  ]);
  const matchedClient = clients.find(
    (client) => phoneLookupKey(client.phone) === phoneLookupKey(conversation.phoneNumber)
  );

  if (!whatsAppConnection || whatsAppConnection.status !== "CONNECTED") {
    return {
      ok: false,
      error:
        "WhatsApp is not connected for this clinic yet. Use Settings to connect the Twilio sandbox first.",
    };
  }

  let delivery:
    | {
        sid: string;
        status: string;
      }
    | undefined;

  try {
    delivery = await sendTwilioWhatsAppMessage({
      to: conversation.phoneNumber,
      body: cleanedBody,
    });
  } catch (error) {
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
      error:
        error instanceof Error
          ? error.message
          : "We couldn't send the WhatsApp message.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId: conversation.id,
        clientId: matchedClient?.id ?? null,
        direction: "OUTBOUND",
        body: cleanedBody,
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
