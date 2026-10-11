import { after } from "next/server";

import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { buildInboxViewFromWorkspace } from "@/lib/inbox";
import { buildWhatsAppConnectionSummary } from "@/lib/settings";
import {
  ensureConversationForClient,
  fetchInboxConversations,
  findClientsForConversations,
} from "@/lib/inbox-server";
import { getPendingFollowUpDraftCount } from "@/lib/follow-ups-data";
import { logger } from "@/lib/logger";
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

  const [recentClient, clientCount, { conversations, totalUnreadCount }, whatsappConnection, followUpsCount] =
    await Promise.all([
      prisma.client.findFirst({
        where: {
          businessId: business.id,
        },
        select: {
          id: true,
        },
        orderBy: [
          {
            updatedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      }),
      prisma.client.count({
        where: {
          businessId: business.id,
        },
      }),
      // Owns the business-wide unread aggregate itself — matches what the
      // dashboard KPI and sidebar badge already use (see dashboard/page.tsx and
      // (workspace)/actions.ts's refreshWorkspaceNotificationsAction).
      fetchInboxConversations(business.id),
      prisma.whatsAppConnection.findUnique({
        where: {
          businessId: business.id,
        },
      }),
      // Best-effort: the FollowUpDraft table's migration may not be applied
      // yet in every environment (nothing else on this page depends on it).
      // Degrade to a count of 0 instead of letting one missing table crash
      // the whole Inbox page for every business.
      getPendingFollowUpDraftCount(business.id).catch((error) => {
        logger.error("Failed to load pending follow-up draft count for Inbox.", error, {
          businessId: business.id,
        });
        return 0;
      }),
    ]);
  // Each conversation is named after the client its number belongs to, looked
  // up directly rather than from a capped recent-clients list (Codex #143).
  const clients = await findClientsForConversations(
    business.id,
    conversations.map((entry) => entry.phoneNumber)
  );
  const inboxView = buildInboxViewFromWorkspace({
    conversations,
    clients,
    totalUnreadCount,
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
      recommendedClientId={recentClient?.id}
      followUpsCount={followUpsCount}
    />
  );
}
