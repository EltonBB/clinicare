"use client";

import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { useWorkspaceNotifications } from "@/components/layout/workspace-live-context";

// Small client island so WorkspaceHeader (rendered by server page components)
// doesn't need to become a client component just to embed the bell.
export function WorkspaceHeaderNotifications() {
  const { unreadCount, items, hasInboxUnread, hasStaffUnread } = useWorkspaceNotifications();

  return (
    <NotificationsMenu
      unreadCount={unreadCount}
      items={items}
      hasInboxUnread={hasInboxUnread}
      hasStaffUnread={hasStaffUnread}
    />
  );
}
