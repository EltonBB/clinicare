import type { MessageChannel, Prisma } from "@prisma/client";

import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";

type SeedClient = {
  id: string;
  name: string;
  phone: string;
};

async function ensureConversationForSeedClient(
  tx: Prisma.TransactionClient,
  businessId: string,
  client: SeedClient,
  channel: MessageChannel = "WHATSAPP"
) {
  const normalizedClientPhone = normalizePhone(client.phone);

  if (!normalizedClientPhone) {
    return;
  }

  await tx.conversation.upsert({
    where: {
      businessId_channel_phoneNumber: {
        businessId,
        channel,
        phoneNumber: normalizedClientPhone,
      },
    },
    update: {
      channel,
      contactName: client.name,
    },
    create: {
      businessId,
      channel,
      phoneNumber: normalizedClientPhone,
      contactName: client.name,
      unreadCount: 0,
    },
  });
}

export async function ensureInboxSeedData(businessId: string) {
  const [conversationCount, clients] = await Promise.all([
    prisma.conversation.count({
      where: {
        businessId,
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
      take: 3,
    }),
  ]);

  if (conversationCount > 0 || clients.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const client of clients) {
      await ensureConversationForSeedClient(tx, businessId, client);
    }
  });
}

export async function ensureConversationForClient(
  businessId: string,
  clientId: string,
  channel?: MessageChannel
) {
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      businessId,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      preferredChannel: true,
    },
  });

  if (!client) {
    return null;
  }

  const normalizedClientPhone = normalizePhone(client.phone);
  const resolvedChannel =
    channel ?? (client.preferredChannel?.toUpperCase() === "SMS" ? "SMS" : "WHATSAPP");

  return prisma.conversation.upsert({
    where: {
      businessId_channel_phoneNumber: {
        businessId,
        channel: resolvedChannel,
        phoneNumber: normalizedClientPhone,
      },
    },
    update: {
      channel: resolvedChannel,
      phoneNumber: normalizedClientPhone,
      contactName: client.name,
    },
    create: {
      businessId,
      channel: resolvedChannel,
      phoneNumber: normalizedClientPhone,
      contactName: client.name,
      unreadCount: 0,
    },
    select: {
      id: true,
    },
  });
}

export async function normalizeConversationsForBusiness(businessId: string) {
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
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
  ]);

  const grouped = new Map<string, typeof conversations>();

  for (const conversation of conversations) {
    const normalizedPhone = normalizePhone(conversation.phoneNumber);
    const lookupKey = `${conversation.channel}:${phoneLookupKey(conversation.phoneNumber)}`;

    if (!normalizedPhone || !lookupKey) {
      continue;
    }

    const group = grouped.get(lookupKey) ?? [];
    group.push(conversation);
    grouped.set(lookupKey, group);
  }

  for (const [lookupKey, group] of grouped) {
    try {
      const channel = group[0]?.channel ?? "WHATSAPP";
      const matchingClient = clients.find(
        (client) => `${channel}:${phoneLookupKey(client.phone)}` === lookupKey
      );
      const canonicalPhone =
        normalizePhone(matchingClient?.phone ?? "") ||
        normalizePhone(group[0]?.phoneNumber ?? "");

      const preferredConversation =
        group.find(
          (conversation) =>
            matchingClient && conversation.phoneNumber === canonicalPhone
        ) ??
        group.find((conversation) => conversation.phoneNumber.startsWith("+")) ??
        group[0];

      const duplicateIds = group
        .filter((conversation) => conversation.id !== preferredConversation.id)
        .map((conversation) => conversation.id);

      await prisma.$transaction(async (tx) => {
        if (duplicateIds.length > 0) {
          await tx.message.updateMany({
            where: {
              conversationId: {
                in: duplicateIds,
              },
            },
            data: {
              conversationId: preferredConversation.id,
            },
          });

          await tx.conversation.deleteMany({
            where: {
              id: {
                in: duplicateIds,
              },
            },
          });
        }

        await tx.conversation.update({
          where: {
            id: preferredConversation.id,
          },
          data: {
            channel,
            phoneNumber: canonicalPhone,
            contactName:
              matchingClient?.name ??
              preferredConversation.contactName ??
              canonicalPhone,
            unreadCount: group.reduce(
              (total, conversation) => total + conversation.unreadCount,
              0
            ),
          },
        });
      });
    } catch (error) {
      console.error("Failed to normalize inbox conversations for business", {
        businessId,
        lookupKey,
        conversationIds: group.map((conversation) => conversation.id),
        error,
      });
    }
  }
}
