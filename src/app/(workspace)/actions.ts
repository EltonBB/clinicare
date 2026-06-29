"use server";

import { requireCurrentWorkspace } from "@/lib/business";
import { prisma } from "@/lib/prisma";

export type WorkspaceNotificationsView = {
  unreadCount: number;
  notifications: Array<{
    id: string;
    title: string;
    detail: string;
  }>;
};

export async function refreshWorkspaceNotificationsAction(): Promise<{
  ok: boolean;
  error?: string;
  view?: WorkspaceNotificationsView;
}> {
  const { business } = await requireCurrentWorkspace("/dashboard", {
    missingBusinessRedirect: "/onboarding",
  });

  const [unreadAggregate, notificationRows] = await Promise.all([
    prisma.conversation.aggregate({
      where: {
        businessId: business.id,
        unreadCount: {
          gt: 0,
        },
      },
      _sum: {
        unreadCount: true,
      },
    }),
    prisma.conversation.findMany({
      where: {
        businessId: business.id,
        unreadCount: {
          gt: 0,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 3,
      select: {
        id: true,
        contactName: true,
        unreadCount: true,
      },
    }),
  ]);

  return {
    ok: true,
    view: {
      unreadCount: unreadAggregate._sum.unreadCount ?? 0,
      notifications: notificationRows.map((row) => ({
        id: row.id,
        title: row.contactName,
        detail: `${row.unreadCount} unread message${
          row.unreadCount === 1 ? "" : "s"
        } waiting in the inbox.`,
      })),
    },
  };
}
