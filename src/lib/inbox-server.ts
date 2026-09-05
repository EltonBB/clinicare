import type { Prisma } from "@prisma/client";

import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// How many of the most-recently-updated conversations load eagerly. Kept in
// sync with the query in inbox/page.tsx's original shape.
const RECENT_CONVERSATION_LIMIT = 50;
// Messages loaded per conversation in that same query — a separate constant
// from RECENT_CONVERSATION_LIMIT (the conversation-count cap) even though
// they share a value today, so retuning one can't silently retune the other.
// There is no further pagination past this: opening a conversation always
// shows its latest RECENT_MESSAGE_LIMIT messages, never literally every
// message ever sent.
export const RECENT_MESSAGE_LIMIT = 50;
// Just enough for the list-row preview (AGENTS.md: "conversation previews
// show the newest message") — an "extra" unread entry's full thread is
// fetched on demand only if the operator actually opens it (see
// hydrateConversationAction in inbox/actions.ts and hasFullHistory below),
// so there's no reason to eagerly carry 50 messages for every one of them.
const UNREAD_PREVIEW_MESSAGE_LIMIT = 1;
// Not a cap — the unread merge query below is deliberately uncapped (see its
// own comment). This only logs so an unusually large result stays visible in
// ops instead of silently paying an ever-growing query cost unnoticed.
const UNREAD_QUERY_SANITY_THRESHOLD = 200;

export function conversationSelect(messageLimit: number) {
  return {
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
      take: messageLimit,
    },
  } satisfies Prisma.ConversationSelect;
}

/**
 * The conversation list + business-wide unread total for both the initial
 * Inbox load and its polling refresh (inbox/page.tsx, inbox/actions.ts's
 * loadInboxView) — kept in one place so both stay in sync, and so callers
 * don't each run their own copy of the totalUnreadCount aggregate.
 *
 * Recency-capped at RECENT_CONVERSATION_LIMIT for display, but a business
 * with more conversations than that can have an unread one fall outside the
 * cap entirely. The "Unread" filter chip's count reflects the business-wide
 * total, so without a second query, the chip could show a positive — or
 * higher — count than the filter could ever actually display, including an
 * empty "Everything is read" result for a chip that says otherwise (Codex
 * finding).
 *
 * That second query is deliberately NOT capped by count — a numeric ceiling
 * just moves the same bug to a higher threshold instead of closing it
 * (Codex's follow-up finding on an earlier version of this fix that used
 * `take: 200`). It's kept cheap per row instead: each "extra" conversation
 * only carries its single latest message (UNREAD_PREVIEW_MESSAGE_LIMIT),
 * tagged `hasFullHistory: false` so the client knows to hydrate the standard
 * window on open (see openConversation in inbox-workspace.tsx) rather than
 * rendering a silently-truncated one. It only runs at all when the aggregate
 * proves `recent` doesn't already account for every unread conversation.
 */
export async function fetchInboxConversations(businessId: string) {
  const [recent, totalUnreadAggregate] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        businessId,
      },
      select: conversationSelect(RECENT_MESSAGE_LIMIT),
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
    prisma.conversation.aggregate({
      where: {
        businessId,
      },
      _sum: {
        unreadCount: true,
      },
    }),
  ]);

  const totalUnreadCount = totalUnreadAggregate._sum.unreadCount ?? 0;
  const recentUnreadCount = recent.reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0
  );

  const byId = new Map(
    recent.map((conversation) => [conversation.id, { ...conversation, hasFullHistory: true }])
  );

  // recent already carries every unread conversation there is — the total
  // can't be any higher without one existing outside it, so skip the merge.
  if (recentUnreadCount < totalUnreadCount) {
    const unread = await prisma.conversation.findMany({
      where: {
        businessId,
        unreadCount: { gt: 0 },
      },
      select: conversationSelect(UNREAD_PREVIEW_MESSAGE_LIMIT),
    });

    if (unread.length > UNREAD_QUERY_SANITY_THRESHOLD) {
      logger.warn("Inbox unread-conversation merge returned an unusually large result.", {
        businessId,
        count: unread.length,
      });
    }

    for (const conversation of unread) {
      if (!byId.has(conversation.id)) {
        byId.set(conversation.id, { ...conversation, hasFullHistory: false });
      }
    }
  }

  return {
    conversations: Array.from(byId.values()).sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
    ),
    totalUnreadCount,
  };
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
