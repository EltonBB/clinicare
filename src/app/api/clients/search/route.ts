import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const RESULT_LIMIT = 20;

// Scoped client typeahead for the booking/edit pickers, so those forms never
// load the whole client table. Tenant-scoped, bounded, and rate-limited like
// the global search route.
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ clients: [] }, { status: 401 });
  }

  const business = await getCurrentBusiness(user.id);

  if (!business) {
    return NextResponse.json({ clients: [] });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().slice(0, 80) ?? "";

  if (query.length < 2) {
    return NextResponse.json({ clients: [] });
  }

  const rate = checkRateLimit(`client-search:${user.id}`, {
    limit: 30,
    windowMs: 10_000,
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { clients: [], error: "Too many searches. Please slow down for a moment." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const clients = await prisma.client.findMany({
    where: {
      businessId: business.id,
      isArchived: false,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
    take: RESULT_LIMIT,
  });

  return NextResponse.json({
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
      phone: client.phone ?? undefined,
    })),
  });
}
