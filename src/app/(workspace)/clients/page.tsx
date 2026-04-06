import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/business";
import { ClientsWorkspace } from "@/components/clients/clients-workspace";
import { buildClientsViewFromRecords } from "@/lib/clients";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { business } = await requireCurrentWorkspace("/clients", {
    missingBusinessRedirect: "/onboarding",
  });

  const { client } = await searchParams;
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
        },
        orderBy: {
          startAt: "desc",
        },
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

  const initialView = buildClientsViewFromRecords(records);
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
