"use server";

import { requireCurrentWorkspace } from "@/lib/business";
import { sanitizeAuthMetadataForSession } from "@/lib/auth-metadata";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

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

  const notificationRows = await prisma.conversation.findMany({
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
  });

  const unreadCount = notificationRows.reduce(
    (total, row) => total + row.unreadCount,
    0
  );

  return {
    ok: true,
    view: {
      unreadCount,
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

export async function completeWorkspaceTourAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const { business } = await requireCurrentWorkspace("/dashboard", {
    missingBusinessRedirect: "/onboarding",
  });
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      error: "We couldn't verify the current user session.",
    };
  }

  const metadata = {
    ...sanitizeAuthMetadataForSession(user.user_metadata),
    workspace_tour_completed_at: new Date().toISOString(),
    workspace_tour_completed_business_id: business.id,
  };

  const { error } = await supabase.auth.updateUser({
    data: metadata,
  });

  if (error) {
    return {
      ok: false,
      error: "We couldn't save the tour completion state.",
    };
  }

  return { ok: true };
}
