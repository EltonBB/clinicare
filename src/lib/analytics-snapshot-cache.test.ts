import { describe, expect, it } from "vitest";

import {
  allPeriodsRateLimited,
  analyticsSnapshotsCacheKey,
  rehydrateAnalyticsSnapshotDates,
} from "@/lib/analytics-snapshot-cache";
import type { GenerateAnalyticsSnapshotResult } from "@/lib/analytics-ai";
import type { ReportAiSnapshotInput } from "@/lib/reports";

describe("analyticsSnapshotsCacheKey", () => {
  it("embeds the businessId so keys never collide across tenants", () => {
    expect(analyticsSnapshotsCacheKey("biz-1")).toBe("analytics-snapshots:biz-1");
    expect(analyticsSnapshotsCacheKey("biz-1")).not.toBe(analyticsSnapshotsCacheKey("biz-2"));
  });
});

describe("rehydrateAnalyticsSnapshotDates", () => {
  const baseSnapshot: ReportAiSnapshotInput = {
    periodType: "DAILY",
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-01-01T23:59:59.999Z"),
    kpiPayload: { some: "data" },
    aiPayload: null,
    provider: "rules",
    model: null,
    status: "FALLBACK",
    generatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };

  it("revives Date fields that arrived as ISO strings (a Redis cache-hit round trip)", () => {
    // Simulates exactly what Upstash hands back on a hit: real Prisma Date
    // objects serialized to strings by JSON.stringify, with no automatic revival.
    const fromRedis = JSON.parse(JSON.stringify([baseSnapshot])) as ReportAiSnapshotInput[];
    expect(typeof fromRedis[0].periodStart).toBe("string");

    const [rehydrated] = rehydrateAnalyticsSnapshotDates(fromRedis);

    expect(rehydrated.periodStart).toBeInstanceOf(Date);
    expect(rehydrated.periodEnd).toBeInstanceOf(Date);
    expect(rehydrated.generatedAt).toBeInstanceOf(Date);
    expect(rehydrated.periodStart.getTime()).toBe(baseSnapshot.periodStart.getTime());
    expect(rehydrated.generatedAt.getTime()).toBe(baseSnapshot.generatedAt.getTime());
  });

  it("is a no-op on already-real Date objects (a cache miss)", () => {
    const [rehydrated] = rehydrateAnalyticsSnapshotDates([baseSnapshot]);

    expect(rehydrated.periodStart.getTime()).toBe(baseSnapshot.periodStart.getTime());
    expect(rehydrated).not.toBe(baseSnapshot); // new object, original untouched
    expect(baseSnapshot.periodStart).toBeInstanceOf(Date); // source object unmutated
  });

  it("preserves non-Date fields untouched", () => {
    const [rehydrated] = rehydrateAnalyticsSnapshotDates([baseSnapshot]);

    expect(rehydrated.kpiPayload).toEqual({ some: "data" });
    expect(rehydrated.status).toBe("FALLBACK");
    expect(rehydrated.aiPayload).toBeNull();
  });
});

describe("allPeriodsRateLimited", () => {
  const rateLimited = (period: GenerateAnalyticsSnapshotResult["period"]): GenerateAnalyticsSnapshotResult => ({
    ok: false,
    period,
    usedAi: false,
    message: "Rate limited",
    rateLimited: true,
  });
  const generated = (period: GenerateAnalyticsSnapshotResult["period"]): GenerateAnalyticsSnapshotResult => ({
    ok: true,
    period,
    usedAi: true,
    message: "Generated",
  });

  it("is true only when all 3 periods were rate-limited", () => {
    expect(
      allPeriodsRateLimited([rateLimited("daily"), rateLimited("weekly"), rateLimited("monthly")])
    ).toBe(true);
  });

  it("is false when at least one period actually generated", () => {
    expect(
      allPeriodsRateLimited([rateLimited("daily"), generated("weekly"), rateLimited("monthly")])
    ).toBe(false);
  });

  it("is false for the cron's forced call (empty cooldown-results array)", () => {
    expect(allPeriodsRateLimited([])).toBe(false);
  });
});
