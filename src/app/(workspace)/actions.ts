"use server";

import { requireCurrentWorkspace } from "@/lib/business";
import { prisma } from "@/lib/prisma";

export type WorkspaceNotificationsView = {
  unreadCount: number;
  notifications: Array<{
    id: string;
    title: string;
    detail: string;
    href: string;
  }>;
};

/**
 * Feeds the app-shell bell — a durable, DB-backed view of what needs the
 * admin's attention, so it survives even if they miss the toast (WorkspaceToaster)
 * that also fires for the same staff-thread activity. Two sources, merged by
 * recency: patient-inbox unread (Conversation.unreadCount) and staff↔admin
 * thread unread (StaffThread.unreadForAdmin — the same field the Staff
 * directory's per-row dot already sums; see getStaffUnreadMessageCounts).
 * Nothing here marks anything read — that only happens when the admin actually
 * opens the inbox conversation or the staff Messages tab, same as today.
 */
export async function refreshWorkspaceNotificationsAction(): Promise<{
  ok: boolean;
  error?: string;
  view?: WorkspaceNotificationsView;
}> {
  const { business } = await requireCurrentWorkspace("/dashboard", {
    missingBusinessRedirect: "/onboarding",
  });

  const [unreadAggregate, notificationRows, staffUnreadAggregate, staffThreadRows] =
    await Promise.all([
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
          updatedAt: true,
        },
      }),
      prisma.staffThread.aggregate({
        where: { businessId: business.id, unreadForAdmin: { gt: 0 } },
        _sum: { unreadForAdmin: true },
      }),
      prisma.staffThread.findMany({
        where: { businessId: business.id, unreadForAdmin: { gt: 0 } },
        orderBy: { lastMessageAt: "desc" },
        take: 3,
        select: {
          staffMemberId: true,
          unreadForAdmin: true,
          lastMessageAt: true,
          staffMember: { select: { name: true } },
        },
      }),
    ]);

  const inboxItems = notificationRows.map((row) => ({
    id: `conversation:${row.id}`,
    title: row.contactName,
    detail: `${row.unreadCount} unread message${
      row.unreadCount === 1 ? "" : "s"
    } waiting in the inbox.`,
    href: "/inbox",
    atMs: row.updatedAt.getTime(),
  }));

  const staffItems = staffThreadRows.map((row) => ({
    id: `staff:${row.staffMemberId}`,
    title: row.staffMember.name,
    detail: `${row.unreadForAdmin} unread message${
      row.unreadForAdmin === 1 ? "" : "s"
    } in your team thread.`,
    href: `/staff/${row.staffMemberId}?tab=messages`,
    atMs: row.lastMessageAt.getTime(),
  }));

  // Each source is capped at 3 rows before merging, then the combined list at
  // 4 — so a just-arrived item can in rare cases be counted in unreadCount
  // but not make this visible-4 cut if the other source has several more
  // recent rows. Acceptable: this list is a backstop to the live toast
  // (WorkspaceToaster), not the only place the event surfaces, and the badge
  // total itself is never capped.
  const notifications = [...inboxItems, ...staffItems]
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, 4)
    .map((item) => ({ id: item.id, title: item.title, detail: item.detail, href: item.href }));

  return {
    ok: true,
    view: {
      unreadCount:
        (unreadAggregate._sum.unreadCount ?? 0) + (staffUnreadAggregate._sum.unreadForAdmin ?? 0),
      notifications,
    },
  };
}
