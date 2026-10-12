import type { ReportAiSnapshotInput } from "@/lib/reports";
import type { GenerateAnalyticsSnapshotResult } from "@/lib/analytics-ai";

// Pulled out of analytics-ai.ts so these pure functions stay importable
// without also pulling in that file's top-level `prisma` import — prisma.ts
// reads DATABASE_URL at module load, which breaks the unit-test suite's
// "no DB" guarantee (vitest.config.ts) for anything that touches it, even
// transitively, even when the calling code never runs a query.

// Shared getCached() key for the Reports page's snapshot read, so the page
// and the manual "Refresh AI" action (which must invalidate it) never drift
// apart on what key they're using.
export function analyticsSnapshotsCacheKey(businessId: string): string {
  return `analytics-snapshots:${businessId}`;
}

// Upstash round-trips a cached value through JSON, which serializes Date
// fields to ISO strings with no automatic revival on the way back out — a
// cache hit would hand reports.ts's aiSnapshotForPeriod() strings where it
// calls .getTime(), throwing instead of rendering. Apply on every read (hit
// or miss; re-wrapping an already-real Date is a harmless no-op) before the
// snapshots reach reports.ts. (Codex)
export function rehydrateAnalyticsSnapshotDates(
  snapshots: ReportAiSnapshotInput[]
): ReportAiSnapshotInput[] {
  return snapshots.map((snapshot) => ({
    ...snapshot,
    periodStart: new Date(snapshot.periodStart),
    periodEnd: new Date(snapshot.periodEnd),
    generatedAt: new Date(snapshot.generatedAt),
  }));
}

export function allPeriodsRateLimited(results: GenerateAnalyticsSnapshotResult[]) {
  return results.length === 3 && results.every((result) => result.rateLimited);
}
