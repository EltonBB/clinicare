"use server";

import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business";
import {
  buildInboxConversation,
  normalizePhone,
  type InboxConversation,
} from "@/lib/inbox";
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

  const normalizedPhone = normalizePhone(conversation.phoneNumber);
  const clients = await prisma.client.findMany({
    where: {
      businessId: context.business.id,
    },
    select: {
      id: true,
      name: true,
      phone: true,
    },
  });
  const matchedClient = clients.find(
    (client) => normalizePhone(client.phone) === normalizedPhone
  );

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        conversationId: conversation.id,
        clientId: matchedClient?.id ?? null,
        direction: "OUTBOUND",
        body: cleanedBody,
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
