import { notFound } from "next/navigation";

import { ClientDetailsPage } from "@/components/clients/client-details-page";
import { requireCurrentWorkspace } from "@/lib/business";
import { buildClientRecord } from "@/lib/clients";
import { prisma } from "@/lib/prisma";

export default async function ClientDetailsRoute({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { business } = await requireCurrentWorkspace("/clients", {
    missingBusinessRedirect: "/onboarding",
  });
  const { clientId } = await params;

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      businessId: business.id,
    },
    include: {
      appointments: {
        select: {
          id: true,
          title: true,
          startAt: true,
          status: true,
        },
        orderBy: {
          startAt: "desc",
        },
        take: 50,
      },
      messages: {
        select: {
          id: true,
          body: true,
          direction: true,
          sentAt: true,
        },
        orderBy: {
          sentAt: "desc",
        },
        take: 50,
      },
      galleryItems: {
        select: {
          id: true,
          type: true,
          imageUrl: true,
          caption: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 60,
      },
      _count: {
        select: {
          appointments: true,
        },
      },
    },
  });

  if (!client) {
    notFound();
  }

  return <ClientDetailsPage initialClient={await buildClientRecord(client)} />;
}
