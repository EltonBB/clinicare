import { after } from "next/server";

import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { buildInboxViewFromWorkspace } from "@/lib/inbox";
import { buildWhatsAppConnectionSummary } from "@/lib/settings";
import { ensureConversationForClient, fetchInboxConversations } from "@/lib/inbox-server";
import { prisma } from "@/lib/prisma";
import { syncWhatsAppConnectionForBusiness } from "@/lib/whatsapp-connection";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; conversation?: string }>;
}) {
  const { user, business } = await requireCurrentWorkspace("/inbox", {
    missingBusinessRedirect: "/onboarding",
  });
  const { ownerName } = toBusinessIdentity(business, user);
  const { client, conversation } = await searchParams;

  const ensuredConversation =
    typeof client === "string" && client.length > 0
      ? await ensureConversationForClient(business.id, client)
      : null;

  after(async () => {
    try {
      await syncWhatsAppConnectionForBusiness(business.id);
    } catch {
      console.error("Failed to refresh WhatsApp connection after inbox response.");
    }
  });

  const [clients, clientCount, conversations, totalUnreadAggregate, whatsappConnection] = await Promise.all([
    prisma.client.findMany({
      where: {
        businessId: business.id,
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
      take: 150,
    }),
    prisma.client.count({
      where: {
        businessId: business.id,
      },
    }),
    fetchInboxConversations(business.id),
    // The list above merges the 50 most-recently-updated conversations with
    // any additionally unread ones (fetchInboxConversations), but this
    // aggregate is still the source of truth for the total — it matches what
    // the dashboard KPI and sidebar badge already use (see dashboard/page.tsx
    // and (workspace)/actions.ts's refreshWorkspaceNotificationsAction).
    prisma.conversation.aggregate({
      where: {
        businessId: business.id,
      },
      _sum: {
        unreadCount: true,
      },
    }),
    prisma.whatsAppConnection.findUnique({
      where: {
        businessId: business.id,
      },
    }),
  ]);
  const inboxView = buildInboxViewFromWorkspace({
    conversations,
    clients,
    totalUnreadCount: totalUnreadAggregate._sum.unreadCount ?? 0,
  });
  const requestedConversationId =
    typeof conversation === "string" &&
    inboxView.conversations.some((entry) => entry.id === conversation)
      ? conversation
      : undefined;

  return (
    <InboxWorkspace
      initialView={{
        ...inboxView,
        initialConversationId:
          requestedConversationId ??
          ensuredConversation?.id ??
          inboxView.initialConversationId,
      }}
      ownerName={ownerName}
      connection={buildWhatsAppConnectionSummary(whatsappConnection)}
      clientCount={clientCount}
      recommendedClientId={clients[0]?.id}
    />
  );
}
