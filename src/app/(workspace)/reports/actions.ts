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
import { canUseWorkspace, WORKSPACE_LOCKED_ERROR } from "@/lib/billing-access";
import { ACTION_RATE_LIMIT_ERROR, isWithinActionBudget, requireCurrentWorkspace } from "@/lib/business";
import { invalidateCacheVersioned } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { plural, fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { translateServerText } from "@/i18n/server-text";
import { formatZonedTime } from "@/lib/time-zone";

export type RefreshAnalyticsInsightsResult = {
  ok: boolean;
  message: string;
  results: GenerateAnalyticsSnapshotResult[];
};

export async function refreshAnalyticsInsightsAction(): Promise<RefreshAnalyticsInsightsResult> {
  const { business, user } = await requireCurrentWorkspace("/reports", {
    missingBusinessRedirect: "/onboarding",
  });

  if (!(await isWithinActionBudget(user.id))) {
    return { ok: false, message: ACTION_RATE_LIMIT_ERROR, results: [] };
  }

  if (!canUseWorkspace(business)) {
    return { ok: false, message: WORKSPACE_LOCKED_ERROR, results: [] };
  }

  const results = await generateAnalyticsSnapshotsForBusiness(business.id);

  // A fully-rate-limited refresh (e.g. a double-click inside the cooldown)
  // writes nothing — skip the cache eviction so the next Reports load still
  // gets a cheap cache hit instead of paying for a no-op refresh. Versioned
  // (not plain) invalidation: a concurrent /reports load whose producer read
  // pre-refresh data must not be able to resurrect it after this bumps the
  // version — see getCachedVersioned's docstring.
  if (!allPeriodsRateLimited(results)) {
    const invalidated = await invalidateCacheVersioned(analyticsSnapshotsCacheKey(business.id));
    if (!invalidated) {
      // Not a hard failure — the 60s TTL still bounds staleness — but a
      // refresh the user just triggered not being immediately visible is
      // worth a signal rather than silently swallowing it.
      logger.warn("Reports cache invalidation failed after a manual refresh", {
        businessId: business.id,
      });
    }
  }
  revalidatePath("/reports");
  revalidatePath("/dashboard");

  const { locale, m } = await getI18n();
  const t = m.reports.refreshResult;
  const generated = results.filter((result) => result.usedAi).length;
  const rateLimitedCount = results.filter((result) => result.rateLimited).length;
  const allRateLimited = rateLimitedCount === results.length && results.length > 0;
  const firstRateLimited = results.find((result) => result.rateLimited);
  const generatedText = plural(t.generated, generated, locale);
  const message =
    generated > 0 && !allRateLimited
      ? `${generatedText}${rateLimitedCount > 0 ? plural(t.kept, rateLimitedCount, locale) : ""}.`
      : firstRateLimited?.nextRefreshAt
      ? fmt(t.tooSoon, { time: formatZonedTime(new Date(firstRateLimited.nextRefreshAt), undefined, locale) })
      : generated > 0
      ? `${generatedText}.`
      : results[0]?.message
      ? translateServerText(results[0].message, locale)
      : t.none;

  return {
    ok: generated > 0,
    message,
    results,
  };
}
