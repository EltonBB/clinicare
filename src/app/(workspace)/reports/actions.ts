"use server";

import { revalidatePath } from "next/cache";

import {
  generateAnalyticsSnapshotsForBusiness,
  type GenerateAnalyticsSnapshotResult,
} from "@/lib/analytics-ai";
import {
  allPeriodsRateLimited,
  analyticsSnapshotsCacheKey,
} from "@/lib/analytics-snapshot-cache";
import { requireCurrentWorkspace } from "@/lib/business";
import { invalidateCache } from "@/lib/cache";

export type RefreshAnalyticsInsightsResult = {
  ok: boolean;
  message: string;
  results: GenerateAnalyticsSnapshotResult[];
};

export async function refreshAnalyticsInsightsAction(): Promise<RefreshAnalyticsInsightsResult> {
  const { business } = await requireCurrentWorkspace("/reports", {
    missingBusinessRedirect: "/onboarding",
  });

  const results = await generateAnalyticsSnapshotsForBusiness(business.id);

  // A fully-rate-limited refresh (e.g. a double-click inside the cooldown)
  // writes nothing — skip the cache eviction so the next Reports load still
  // gets a cheap cache hit instead of paying for a no-op refresh.
  if (!allPeriodsRateLimited(results)) {
    await invalidateCache(analyticsSnapshotsCacheKey(business.id));
  }
  revalidatePath("/reports");
  revalidatePath("/dashboard");

  const generated = results.filter((result) => result.usedAi).length;
  const rateLimitedCount = results.filter((result) => result.rateLimited).length;
  const allRateLimited = rateLimitedCount === results.length && results.length > 0;
  const firstRateLimited = results.find((result) => result.rateLimited);
  const message =
    generated > 0 && !allRateLimited
      ? `Generated fresh analysis for ${generated} timeframe${generated === 1 ? "" : "s"}${
          rateLimitedCount > 0
            ? ` and kept ${rateLimitedCount} recent timeframe${rateLimitedCount === 1 ? "" : "s"}`
            : ""
        }.`
      : firstRateLimited
      ? firstRateLimited.message
      : generated > 0
      ? `Generated fresh analysis for ${generated} timeframe${generated === 1 ? "" : "s"}.`
      : results[0]?.message ?? "AI insights were not generated.";

  return {
    ok: generated > 0,
    message,
    results,
  };
}
