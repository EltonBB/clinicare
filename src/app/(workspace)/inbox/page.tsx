import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { buildInboxViewFromWorkspace } from "@/lib/inbox";
import { buildSmsConnectionSummary, buildWhatsAppConnectionSummary } from "@/lib/settings";
import { ensureConversationForClient } from "@/lib/inbox-server";
import { prisma } from "@/lib/prisma";
import { syncSmsConnectionForBusiness } from "@/lib/sms-connection";
import { syncWhatsAppConnectionForBusiness } from "@/lib/whatsapp-connection";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { user, business } = await requireCurrentWorkspace("/inbox", {
    missingBusinessRedirect: "/onboarding",
  });
  const { ownerName } = toBusinessIdentity(business, user);
  const { client } = await searchParams;

  const ensuredConversation =
    typeof client === "string" && client.length > 0
      ? await ensureConversationForClient(business.id, client)
      : null;

  const [syncedWhatsAppConnection, syncedSmsConnection] = await Promise.all([
    syncWhatsAppConnectionForBusiness(business.id),
    syncSmsConnectionForBusiness(business.id),
  ]);

  const [clients, conversations, whatsappConnection, smsConnection] = await Promise.all([
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
    }),
    prisma.conversation.findMany({
      where: {
        businessId: business.id,
      },
      select: {
        id: true,
        channel: true,
        phoneNumber: true,
        contactName: true,
        unreadCount: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            channel: true,
            direction: true,
            body: true,
            deliveryStatus: true,
            sentAt: true,
          },
          orderBy: {
            sentAt: "asc",
          },
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
    }),
    Promise.resolve(syncedWhatsAppConnection),
    Promise.resolve(syncedSmsConnection),
  ]);
  const inboxView = buildInboxViewFromWorkspace({
    conversations,
    clients,
  });

  return (
    <InboxWorkspace
      initialView={{
        ...inboxView,
        initialConversationId:
          ensuredConversation?.id ?? inboxView.initialConversationId,
      }}
      ownerName={ownerName}
      connections={{
        whatsapp: buildWhatsAppConnectionSummary(
          whatsappConnection,
          business.whatsappNumber ?? ""
        ),
        sms: buildSmsConnectionSummary(smsConnection, business.smsNumber ?? ""),
      }}
    />
  );
}
