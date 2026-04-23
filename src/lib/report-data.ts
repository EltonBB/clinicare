import { endOfDay, startOfDay, subDays } from "date-fns";

import { prisma } from "@/lib/prisma";

export async function getReportWorkspaceData(businessId: string) {
  const reportStart = startOfDay(subDays(new Date(), 209));
  const reportEnd = endOfDay(new Date());

  const [
    business,
    appointments,
    clients,
    messages,
    businessHours,
    staffMembers,
    conversations,
  ] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: {
        id: businessId,
      },
      select: {
        id: true,
        name: true,
        businessType: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        businessId,
        startAt: {
          gte: reportStart,
          lte: reportEnd,
        },
      },
      select: {
        status: true,
        startAt: true,
        endAt: true,
        clientId: true,
        staffMemberId: true,
      },
    }),
    prisma.client.findMany({
      where: {
        businessId,
      },
      select: {
        createdAt: true,
        status: true,
        isArchived: true,
      },
    }),
    prisma.message.findMany({
      where: {
        sentAt: {
          gte: reportStart,
          lte: reportEnd,
        },
        conversation: {
          businessId,
        },
      },
      select: {
        direction: true,
        sentAt: true,
      },
    }),
    prisma.businessHours.findMany({
      where: {
        businessId,
      },
      select: {
        weekday: true,
        isOpen: true,
        startTime: true,
        endTime: true,
      },
    }),
    prisma.staffMember.findMany({
      where: {
        businessId,
      },
      select: {
        status: true,
        isActive: true,
      },
    }),
    prisma.conversation.findMany({
      where: {
        businessId,
      },
      select: {
        unreadCount: true,
      },
    }),
  ]);

  return {
    business,
    appointments,
    clients,
    messages,
    businessHours,
    staffMembers,
    conversations,
  };
}
