"use server";

import { requireCurrentWorkspace } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import {
  buildDashboardConversationPreviews,
  type DashboardConversationPreview,
} from "@/lib/dashboard";
import { getAppTimeZone } from "@/lib/time-zone";

export type WorkspaceNotificationsView = {
  unreadCount: number;
  notifications: Array<{
    id: string;
    title: string;
    detail: string;
  }>;
  conversationPreviews: DashboardConversationPreview[];
};

export async function refreshWorkspaceNotificationsAction(): Promise<{
  ok: boolean;
  error?: string;
  view?: WorkspaceNotificationsView;
}> {
  const { business } = await requireCurrentWorkspace("/dashboard", {
    missingBusinessRedirect: "/onboarding",
  });

  const [unreadAggregate, notificationRows, recentConversations] = await Promise.all([
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
    // Recent conversations (read or not) drive the dashboard Messages preview
    // list so it refreshes incoming replies on the same poll — no extra tick.
    prisma.conversation.findMany({
      where: {
        businessId: business.id,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 4,
      select: {
        id: true,
        contactName: true,
        unreadCount: true,
        updatedAt: true,
        messages: {
          select: {
            body: true,
            sentAt: true,
          },
          orderBy: {
            sentAt: "desc",
          },
          take: 1,
        },
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
      conversationPreviews: buildDashboardConversationPreviews(
        recentConversations,
        new Date(),
        getAppTimeZone(),
      ),
    },
  };
}
