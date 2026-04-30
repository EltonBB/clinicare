import { NextResponse } from "next/server";

import { generateAnalyticsSnapshotsForBusiness } from "@/lib/analytics-ai";
import { isProBusinessPlan } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();

  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization")?.trim();
  return authorization === `Bearer ${configuredSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const businesses = await prisma.business.findMany({
    where: {
      planStatus: "ACTIVE",
    },
    select: {
      id: true,
      plan: true,
    },
  });
  const proBusinesses = businesses.filter((business) =>
    isProBusinessPlan(business.plan)
  );
  const results = [];

  for (const business of proBusinesses) {
    const snapshots = await generateAnalyticsSnapshotsForBusiness(business.id, { force: true });
    results.push({
      businessId: business.id,
      generated: snapshots.filter((snapshot) => snapshot.usedAi).length,
      failed: snapshots.filter((snapshot) => !snapshot.usedAi).length,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      processedBusinesses: proBusinesses.length,
      results,
      triggeredAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
