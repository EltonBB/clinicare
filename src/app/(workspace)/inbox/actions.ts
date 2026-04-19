"use server";

import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business";
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
import { sendTwilioSmsMessage } from "@/lib/sms";
import { syncSmsConnectionForBusiness } from "@/lib/sms-connection";
import { syncWhatsAppConnectionForBusiness } from "@/lib/whatsapp-connection";
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

export type ConvertConversationToClientResult = {
  ok: boolean;
  error?: string;
  conversation?: InboxConversation;
  clientId?: string;
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

  return { business, user } as const;
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
        channel: true,
        phoneNumber: true,
        contactName: true,
        unreadCount: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            channel: true,
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
        channel: true,
        phoneNumber: true,
        contactName: true,
        unreadCount: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            channel: true,
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
      channel: true,
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
  const matchedClient = clients.find(
    (client) => phoneLookupKey(client.phone) === phoneLookupKey(conversation.phoneNumber)
  );

  let delivery:
    | {
        sid: string;
        status: string;
      }
    | undefined;
  let outboundBody = cleanedBody;

  try {
    if (conversation.channel === "SMS") {
      const smsConnection = await syncSmsConnectionForBusiness(context.business.id);

      if (!smsConnection || smsConnection.status !== "CONNECTED") {
        return {
          ok: false,
          error:
            "SMS is not connected for this clinic yet. Finish the clinic SMS setup in Settings first.",
        };
      }

      const senderPhoneNumber = smsConnection.senderPhoneNumber?.trim() || "";

      if (!senderPhoneNumber) {
        return {
          ok: false,
          error:
            "This clinic does not have an active SMS sender yet. Finish the clinic SMS setup in Settings first.",
        };
      }

      delivery = await sendTwilioSmsMessage({
        to: conversation.phoneNumber,
        body: cleanedBody,
        from: senderPhoneNumber,
      });
    } else {
      const whatsAppConnection = await syncWhatsAppConnectionForBusiness(
        context.business.id
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
      outboundBody =
        !hasOpenFreeformWindow && firstMessageTemplateSid
          ? renderedTemplateBody
          : cleanedBody;

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
    }
  } catch (error) {
    if (conversation.channel === "SMS") {
      await prisma.smsConnection.updateMany({
        where: {
          businessId: context.business.id,
        },
        data: {
          status: "ERRORED",
          lastError:
            error instanceof Error ? error.message : "We couldn't send the SMS message.",
          lastSyncedAt: new Date(),
        },
      });
    } else {
      await prisma.whatsAppConnection.update({
        where: {
          businessId: context.business.id,
        },
        data: {
          status: "ERRORED",
          lastSyncedAt: new Date(),
        },
      });
    }

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : conversation.channel === "SMS"
            ? "We couldn't send the SMS message."
            : "We couldn't send the WhatsApp message.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId: conversation.id,
        clientId: matchedClient?.id ?? null,
        channel: conversation.channel,
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
        channel: conversation.channel,
        contactName: matchedClient?.name ?? conversation.contactName,
        unreadCount: 0,
      },
    });

    if (conversation.channel === "SMS") {
      await tx.smsConnection.updateMany({
        where: {
          businessId: context.business.id,
        },
        data: {
          status: "CONNECTED",
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });
    } else {
      await tx.whatsAppConnection.update({
        where: {
          businessId: context.business.id,
        },
        data: {
          status: "CONNECTED",
          lastSyncedAt: new Date(),
        },
      });
    }
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
  const cleanedName = payload.name.trim();
  const cleanedEmail = payload.email?.trim() || null;

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      businessId,
    },
    select: {
      id: true,
      channel: true,
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
      const created = await tx.client.create({
        data: {
          businessId,
          name: cleanedName,
          email: cleanedEmail,
          phone: normalizedPhone,
          preferredChannel: conversation.channel === "SMS" ? "SMS" : "WhatsApp",
        },
        select: {
          id: true,
          name: true,
        },
      });

      resolvedClientId = created.id;
      resolvedClientName = created.name;
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
