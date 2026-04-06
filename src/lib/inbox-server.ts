import { subHours, subMinutes } from "date-fns";
import type { Prisma } from "@prisma/client";

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
  now: Date
) {
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
        phoneNumber: client.phone,
      },
    },
    update: {
      contactName: client.name,
      unreadCount,
    },
    create: {
      businessId,
      phoneNumber: client.phone,
      contactName: client.name,
      unreadCount,
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

  await prisma.$transaction(async (tx) => {
    for (const [index, client] of clients.entries()) {
      await seedConversationForClient(
        tx,
        businessId,
        client,
        index === 0 ? 3 : index === 1 ? 1 : 0,
        now
      );
    }

    await seedUnlinkedConversation(tx, businessId, now);
  });
}
