import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { buildInboxViewFromWorkspace } from "@/lib/inbox";
import { ensureInboxSeedData } from "@/lib/inbox-server";
import { prisma } from "@/lib/prisma";

export default async function InboxPage() {
  const { user, business } = await requireCurrentWorkspace("/inbox", {
    missingBusinessRedirect: "/onboarding",
  });
  const { ownerName } = toBusinessIdentity(business, user);

  try {
    await ensureInboxSeedData(business.id);
  } catch (error) {
    console.error("Failed to seed inbox conversations", error);
  }

  const [clients, conversations] = await Promise.all([
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
        phoneNumber: true,
        contactName: true,
        unreadCount: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            direction: true,
            body: true,
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
  ]);
  const inboxView = buildInboxViewFromWorkspace({
    conversations,
    clients,
  });

  return <InboxWorkspace initialView={inboxView} ownerName={ownerName} />;
}
