"use server";

import { revalidatePath } from "next/cache";

import {
  generateAnalyticsSnapshotsForBusiness,
  type GenerateAnalyticsSnapshotResult,
} from "@/lib/analytics-ai";
import { requireCurrentWorkspace } from "@/lib/business";

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

  revalidatePath("/reports");
  revalidatePath("/dashboard");

  const generated = results.filter((result) => result.usedAi).length;
  const rateLimited = results.find((result) => result.rateLimited);
  const message =
    rateLimited
      ? rateLimited.message
      : generated > 0
      ? `Generated a fresh AI analysis for ${generated} timeframe${generated === 1 ? "" : "s"}.`
      : results[0]?.message ?? "AI insights were not generated.";

  return {
    ok: generated > 0,
    message,
    results,
  };
}
