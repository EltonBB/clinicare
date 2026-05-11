import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/business";
import { ClientsWorkspace } from "@/components/clients/clients-workspace";
import { buildClientsViewFromRecords } from "@/lib/clients";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; new?: string; next?: string }>;
}) {
  const { business } = await requireCurrentWorkspace("/clients", {
    missingBusinessRedirect: "/onboarding",
  });

  const { client, new: openNew, next } = await searchParams;

  if (openNew === "1") {
    redirect(`/clients/new${next === "calendar" ? "?next=calendar" : ""}`);
  }

  const records = await prisma.client.findMany({
    where: {
      businessId: business.id,
    },
    include: {
      appointments: {
        select: {
          id: true,
          title: true,
          startAt: true,
          status: true,
          notes: true,
        },
        orderBy: {
          startAt: "desc",
        },
        take: 25,
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
        take: 25,
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
        take: 24,
      },
      medications: {
        select: {
          id: true,
          name: true,
          dosage: true,
          frequency: true,
          notes: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      },
      documents: {
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileUrl: true,
          notes: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 24,
      },
      payments: {
        select: {
          id: true,
          appointmentId: true,
          amountCents: true,
          status: true,
          description: true,
          receiptUrl: true,
          paidAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 30,
      },
      _count: {
        select: {
          appointments: true,
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
  });

  const initialView = await buildClientsViewFromRecords(records);
  const initialSelectedClientId =
    typeof client === "string" &&
    initialView.clients.some((record) => record.id === client)
      ? client
      : initialView.initialSelectedClientId;

  return (
    <ClientsWorkspace
      initialView={{
        ...initialView,
        initialSelectedClientId,
      }}
    />
  );
}
