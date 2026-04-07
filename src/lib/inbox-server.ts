import { subHours, subMinutes } from "date-fns";
import type { Prisma } from "@prisma/client";

import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";

type SeedClient = {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  assignedStaffName: string | null;
  appointments: Array<{
    title: string;
    startAt: Date;
    staffMember: {
      name: string;
    } | null;
  }>;
};

async function seedConversationForClient(
  tx: Prisma.TransactionClient,
  businessId: string,
  client: SeedClient,
  unreadCount: number,
  now: Date,
  seedMessages: boolean
) {
  const normalizedClientPhone = normalizePhone(client.phone);
  const latestAppointment = client.appointments[0];
  const staffName =
    latestAppointment?.staffMember?.name ??
    client.assignedStaffName ??
    "Workspace staff";
  const serviceName = latestAppointment?.title ?? "your upcoming appointment";
  const conversation = await tx.conversation.upsert({
    where: {
      businessId_phoneNumber: {
        businessId,
        phoneNumber: normalizedClientPhone,
      },
    },
    update: {
      contactName: client.name,
      unreadCount,
    },
    create: {
      businessId,
      phoneNumber: normalizedClientPhone,
      contactName: client.name,
      unreadCount,
    },
  });

  if (!seedMessages) {
    return;
  }

  const messageCount = await tx.message.count({
    where: {
      conversationId: conversation.id,
    },
  });

  if (messageCount > 0) {
    return;
  }

  await tx.message.createMany({
    data: [
      {
        conversationId: conversation.id,
        clientId: client.id,
        direction: "SYSTEM",
        body: "Reminder: 24-hour confirmation message scheduled",
        sentAt: subHours(now, 3),
      },
      {
        conversationId: conversation.id,
        clientId: client.id,
        direction: "INBOUND",
        body:
          client.notes?.trim() ||
          `Can you confirm the time for ${serviceName}?`,
        sentAt: subMinutes(now, 58),
      },
      {
        conversationId: conversation.id,
        clientId: client.id,
        direction: "OUTBOUND",
        body: `Yes, you're confirmed with ${staffName} and we'll send a reminder before the visit.`,
        sentAt: subMinutes(now, 42),
      },
    ],
  });
}

async function seedUnlinkedConversation(
  tx: Prisma.TransactionClient,
  businessId: string,
  now: Date
) {
  const conversation = await tx.conversation.upsert({
    where: {
      businessId_phoneNumber: {
        businessId,
        phoneNumber: "+15550000009",
      },
    },
    update: {
      contactName: "Unknown number",
      unreadCount: 2,
    },
    create: {
      businessId,
      phoneNumber: "+15550000009",
      contactName: "Unknown number",
      unreadCount: 2,
    },
  });

  const messageCount = await tx.message.count({
    where: {
      conversationId: conversation.id,
    },
  });

  if (messageCount > 0) {
    return;
  }

  await tx.message.createMany({
    data: [
      {
        conversationId: conversation.id,
        direction: "INBOUND",
        body: "Hi, I'd like to book a session for next Tuesday.",
        sentAt: subMinutes(now, 21),
      },
      {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        body: "Happy to help. Share your name and preferred time and we'll line it up.",
        sentAt: subMinutes(now, 16),
      },
    ],
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
        notes: true,
        assignedStaffName: true,
        appointments: {
          select: {
            title: true,
            startAt: true,
            staffMember: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            startAt: "desc",
          },
          take: 1,
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
      take: 3,
    }),
  ]);

  if (conversationCount > 0) {
    return;
  }

  const now = new Date();
  const shouldSeedMessages = true;

  await prisma.$transaction(async (tx) => {
    for (const [index, client] of clients.entries()) {
      await seedConversationForClient(
        tx,
        businessId,
        client,
        shouldSeedMessages ? (index === 0 ? 3 : index === 1 ? 1 : 0) : 0,
        now,
        shouldSeedMessages
      );
    }

    if (shouldSeedMessages) {
      await seedUnlinkedConversation(tx, businessId, now);
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

  return prisma.conversation.upsert({
    where: {
      businessId_phoneNumber: {
        businessId,
        phoneNumber: normalizedClientPhone,
      },
    },
    update: {
      phoneNumber: normalizedClientPhone,
      contactName: client.name,
    },
    create: {
      businessId,
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
      }

      await tx.conversation.update({
        where: {
          id: preferredConversation.id,
        },
        data: {
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

      if (duplicateIds.length > 0) {
        await tx.conversation.deleteMany({
          where: {
            id: {
              in: duplicateIds,
            },
          },
        });
      }
    });
  }
}
