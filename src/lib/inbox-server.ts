import type { Prisma } from "@prisma/client";

import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// Loaded for display, not the full history — the thread view lazily shows
// more on scroll (kept in sync with the query in inbox/page.tsx's original
// shape).
const RECENT_CONVERSATION_LIMIT = 50;
// A generous but bounded ceiling on how many older, off-screen unread
// conversations get pulled in alongside the recent list — see
// fetchInboxConversations below.
const UNREAD_CONVERSATION_SAFETY_LIMIT = 200;

const conversationListSelect = {
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
} satisfies Prisma.ConversationSelect;

/**
 * The conversation list for both the initial Inbox load and its polling
 * refresh (inbox/page.tsx, inbox/actions.ts's loadInboxView) — kept in one
 * place so both stay in sync.
 *
 * Recency-capped at RECENT_CONVERSATION_LIMIT for display, but a business
 * with more conversations than that can have an unread one fall outside the
 * cap entirely. The "Unread" filter chip's count reflects the business-wide
 * total (see totalUnreadCount in inbox/page.tsx), so without this, the chip
 * could show a positive — or higher — count than the filter could ever
 * actually display, including an empty "Everything is read" result for a
 * chip that says otherwise (Codex finding). Merging in any unread
 * conversation regardless of recency guarantees every thread the count
 * represents is one the operator can actually open.
 */
export async function fetchInboxConversations(businessId: string) {
  const [recent, unread] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        businessId,
      },
      select: conversationListSelect,
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: RECENT_CONVERSATION_LIMIT,
    }),
    prisma.conversation.findMany({
      where: {
        businessId,
        unreadCount: { gt: 0 },
      },
      select: conversationListSelect,
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: UNREAD_CONVERSATION_SAFETY_LIMIT,
    }),
  ]);

  const byId = new Map(recent.map((conversation) => [conversation.id, conversation]));

  for (const conversation of unread) {
    if (!byId.has(conversation.id)) {
      byId.set(conversation.id, conversation);
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
  );
}

type SeedClient = {
  id: string;
  name: string;
  phone: string;
};

async function ensureConversationForSeedClient(
  tx: Prisma.TransactionClient,
  businessId: string,
  client: SeedClient
) {
  const normalizedClientPhone = normalizePhone(client.phone);
  const clientPhoneKey = phoneLookupKey(client.phone);

  if (!normalizedClientPhone || !clientPhoneKey) {
    return;
  }

  await tx.conversation.upsert({
    where: {
      businessId_phoneKey: {
        businessId,
        phoneKey: clientPhoneKey,
      },
    },
    update: {
      contactName: client.name,
    },
    create: {
      businessId,
      phoneNumber: normalizedClientPhone,
      phoneKey: clientPhoneKey,
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
  clientId: string
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
    },
  });

  if (!client) {
    return null;
  }

  const normalizedClientPhone = normalizePhone(client.phone);
  const clientPhoneKey = phoneLookupKey(client.phone);

  if (!clientPhoneKey) {
    return null;
  }

  return prisma.conversation.upsert({
    where: {
      businessId_phoneKey: {
        businessId,
        phoneKey: clientPhoneKey,
      },
    },
    update: {
      phoneNumber: normalizedClientPhone,
      contactName: client.name,
    },
    create: {
      businessId,
      phoneNumber: normalizedClientPhone,
      phoneKey: clientPhoneKey,
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
    const lookupKey = phoneLookupKey(conversation.phoneNumber);

    if (!normalizedPhone || !lookupKey) {
      continue;
    }

    const group = grouped.get(lookupKey) ?? [];
    group.push(conversation);
    grouped.set(lookupKey, group);
  }

  for (const [lookupKey, group] of grouped) {
    try {
      const matchingClient = clients.find(
        (client) => phoneLookupKey(client.phone) === lookupKey
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
            phoneNumber: canonicalPhone,
            phoneKey: lookupKey,
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
      // Record IDs only — `lookupKey` is a patient phone number (PHI) and must
      // never reach logs.
      logger.error("Failed to normalize inbox conversations for business.", error, {
        businessId,
        conversationIds: group.map((conversation) => conversation.id).join(","),
      });
    }
  }
}
