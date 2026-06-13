import { NextResponse } from "next/server";

import { generateAnalyticsSnapshotsForBusiness } from "@/lib/analytics-ai";
import { isProBusinessPlan } from "@/lib/billing";
import { mapWithConcurrency } from "@/lib/concurrency";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// Each Pro business runs a heavy report build + up to ~50s of AI calls; give the
// batch room beyond the platform default. Requires a Vercel plan allowing this.
export const maxDuration = 300;

// Process a few tenants at a time: enough to finish the batch in time, bounded
// so concurrent AI calls don't spike spend or hit provider rate limits.
const ANALYTICS_CONCURRENCY = 3;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
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

  const results = await mapWithConcurrency(
    proBusinesses,
    ANALYTICS_CONCURRENCY,
    async (business) => {
      try {
        const snapshots = await generateAnalyticsSnapshotsForBusiness(business.id, {
          force: true,
        });
        return {
          businessId: business.id,
          generated: snapshots.filter((snapshot) => snapshot.usedAi).length,
          failed: snapshots.filter((snapshot) => !snapshot.usedAi).length,
          errored: false,
        };
      } catch (error) {
        // Isolate per-tenant failures so one bad business can't abort the batch.
        logger.error("Analytics snapshot generation failed for business.", error, {
          businessId: business.id,
        });
        return { businessId: business.id, generated: 0, failed: 0, errored: true };
      }
    }
  );

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
