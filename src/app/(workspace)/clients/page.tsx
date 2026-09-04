import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/business";
import { ClientsWorkspace } from "@/components/clients/clients-workspace";
import {
  attentionCutoffDate,
  buildClientDirectoryViewFromRecords,
  type ClientDirectoryFilter,
} from "@/lib/clients";

const PAGE_SIZE = 25;

const directoryFilters: ClientDirectoryFilter[] = [
  "all",
  "active",
  "inactive",
  "archived",
  "attention",
  "no-visits",
];

function parseFilter(value: string | undefined): ClientDirectoryFilter {
  return directoryFilters.includes(value as ClientDirectoryFilter)
    ? (value as ClientDirectoryFilter)
    : "all";
}

function parsePage(value: string | undefined) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildFilterWhere(filter: ClientDirectoryFilter): Prisma.ClientWhereInput {
  switch (filter) {
    case "active":
      return { isArchived: false, status: "ACTIVE" };
    case "inactive":
      return { isArchived: false, status: "INACTIVE" };
    case "archived":
      return { OR: [{ isArchived: true }, { status: "ARCHIVED" }] };
    case "attention":
      return {
        isArchived: false,
        status: { not: "ARCHIVED" },
        OR: [
          { status: "AT_RISK" },
          { lastVisitAt: { lt: attentionCutoffDate() } },
        ],
      };
    case "no-visits":
      return {
        isArchived: false,
        status: { not: "ARCHIVED" },
        lastVisitAt: null,
      };
    default:
      return {};
  }
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    client?: string;
    new?: string;
    next?: string;
    q?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const { business } = await requireCurrentWorkspace("/clients", {
    missingBusinessRedirect: "/onboarding",
  });

  const { client, new: openNew, next, q, status, page } = await searchParams;

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

  const filter = parseFilter(status);
  const query = (q ?? "").trim().slice(0, 80);
  const requestedPage = parsePage(page);

  const searchWhere: Prisma.ClientWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
        ],
      }
    : {};

  const where: Prisma.ClientWhereInput = {
    businessId: business.id,
    AND: [searchWhere, buildFilterWhere(filter)],
  };

  // Chip counts are independent and need no transactional consistency, so run
  // them in parallel rather than sequentially down a single connection.
  const [
    total,
    allCount,
    activeCount,
    inactiveCount,
    atRiskCount,
    archivedCount,
    attentionCount,
    noVisitsCount,
  ] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.count({ where: { businessId: business.id } }),
    prisma.client.count({
      where: { businessId: business.id, ...buildFilterWhere("active") },
    }),
    prisma.client.count({
      where: { businessId: business.id, ...buildFilterWhere("inactive") },
    }),
    prisma.client.count({
      where: { businessId: business.id, isArchived: false, status: "AT_RISK" },
    }),
    prisma.client.count({
      where: { businessId: business.id, ...buildFilterWhere("archived") },
    }),
    prisma.client.count({
      where: { businessId: business.id, ...buildFilterWhere("attention") },
    }),
    prisma.client.count({
      where: { businessId: business.id, ...buildFilterWhere("no-visits") },
    }),
  ]);

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const currentPage = Math.min(requestedPage, pageCount);

  const records = await prisma.client.findMany({
    where,
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
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const initialView = buildClientDirectoryViewFromRecords(records, {
    total,
    page: currentPage,
    pageSize: PAGE_SIZE,
    counts: {
      all: allCount,
      active: activeCount,
      inactive: inactiveCount,
      atRisk: atRiskCount,
      archived: archivedCount,
      attention: attentionCount,
      noVisits: noVisitsCount,
    },
  });

  return (
    <ClientsWorkspace
      initialView={initialView}
      initialQuery={query}
      activeFilter={filter}
    />
  );
}
