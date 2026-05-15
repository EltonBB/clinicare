import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/business";
import { ClientsWorkspace } from "@/components/clients/clients-workspace";
import { buildClientDirectoryViewFromRecords } from "@/lib/clients";

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

  if (typeof client === "string" && client.length > 0) {
    const matchingClient = await prisma.client.findFirst({
      where: {
        id: client,
        businessId: business.id,
      },
      select: {
        id: true,
      },
    });

    if (matchingClient) {
      redirect(`/clients/${matchingClient.id}`);
    }
  }

  const records = await prisma.client.findMany({
    where: {
      businessId: business.id,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      isArchived: true,
      lastVisitAt: true,
      createdAt: true,
      appointments: {
        select: {
          title: true,
          startAt: true,
          notes: true,
          staffMember: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          startAt: "desc",
        },
        take: 1,
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

  const initialView = buildClientDirectoryViewFromRecords(records);

  return <ClientsWorkspace initialView={initialView} />;
}
