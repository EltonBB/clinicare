import { Prisma, type AnalyticsSnapshotPeriod } from "@prisma/client";

import { buildReportsViewFromWorkspace, type ReportPeriodKey } from "@/lib/reports";
import { getReportWorkspaceData } from "@/lib/report-data";
import { prisma } from "@/lib/prisma";

const manualRefreshCooldownMs = 15 * 60 * 1000;

const AI_SNAPSHOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "score",
    "tone",
    "headline",
    "summary",
    "strength",
    "watch",
    "focus",
    "actions",
  ],
  properties: {
    score: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },
    tone: {
      type: "string",
      enum: ["strong", "healthy", "watch", "attention"],
    },
    headline: {
      type: "string",
      maxLength: 160,
    },
    summary: {
      type: "string",
      maxLength: 420,
    },
    strength: {
      type: "string",
      maxLength: 420,
    },
    watch: {
      type: "string",
      maxLength: 420,
    },
    focus: {
      type: "string",
      maxLength: 420,
    },
    actions: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "priority"],
        properties: {
          title: {
            type: "string",
            maxLength: 96,
          },
          detail: {
            type: "string",
            maxLength: 240,
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
        },
      },
    },
  },
} as const;

function getAnalyticsModel() {
  return process.env.OPENAI_ANALYTICS_MODEL?.trim() || "gpt-4.1-mini";
}

export type GenerateAnalyticsSnapshotResult = {
  ok: boolean;
  period: ReportPeriodKey;
  usedAi: boolean;
  message: string;
  rateLimited?: boolean;
  nextRefreshAt?: string;
};

function periodKeyToSnapshotPeriod(period: ReportPeriodKey): AnalyticsSnapshotPeriod {
  if (period === "daily") return "DAILY";
  if (period === "weekly") return "WEEKLY";
  return "MONTHLY";
}

function snapshotPeriodToPeriodKey(period: AnalyticsSnapshotPeriod): ReportPeriodKey {
  if (period === "DAILY") return "daily";
  if (period === "WEEKLY") return "weekly";
  return "monthly";
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function extractOpenAIText(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];

    for (const entry of content) {
      if (typeof entry !== "object" || entry === null) continue;
      const entryRecord = entry as Record<string, unknown>;
      if (
        (entryRecord.type === "output_text" || entryRecord.type === "text") &&
        typeof entryRecord.text === "string"
      ) {
        return entryRecord.text;
      }
    }
  }

  return null;
}

function buildAiPromptPayload(args: {
  businessName: string;
  businessType: string;
  period: ReportPeriodKey;
  report: ReturnType<typeof buildReportsViewFromWorkspace>;
}) {
  const period = args.report.periods[args.period];

  return {
    clinic: {
      name: args.businessName,
      type: args.businessType,
    },
    period: {
      key: args.period,
      label: period.label,
      rangeLabel: period.rangeLabel,
      comparisonLabel: period.comparisonLabel,
    },
    currentRuleSnapshot: period.snapshot,
    metrics: period.metrics.map((metric) => ({
      label: metric.label,
      value: metric.value,
      delta: metric.delta,
      trend: metric.trend,
      helper: metric.helper,
    })),
    trend: period.chart.points,
    guardrails: {
      doNotInventNumbers: true,
      doNotMentionPatientsByName: true,
      recommendationStyle: "specific operational advice for a clinic owner",
    },
  };
}

async function requestOpenAIInsight(promptPayload: unknown) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false as const,
      error: "OPENAI_API_KEY is not configured.",
    };
  }

  const model = getAnalyticsModel();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "You are an operations analyst for small clinics. Interpret only the provided aggregate metrics. Return concise, practical recommendations in the requested JSON schema. Do not invent metrics, diagnose medical issues, or mention individual patients.",
        },
        {
          role: "user",
          content: JSON.stringify(promptPayload),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "clinic_analytics_snapshot",
          strict: true,
          schema: AI_SNAPSHOT_SCHEMA,
        },
      },
      max_output_tokens: 1400,
    }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      ok: false as const,
      error: `OpenAI analytics request failed with ${response.status}.`,
      model,
    };
  }

  const payload = (await response.json()) as unknown;
  const text = extractOpenAIText(payload);

  if (!text) {
    return {
      ok: false as const,
      error: "OpenAI analytics response did not include structured text.",
      model,
    };
  }

  try {
    return {
      ok: true as const,
      model,
      payload: JSON.parse(text) as unknown,
    };
  } catch {
    return {
      ok: false as const,
      error: "OpenAI analytics response was not valid JSON.",
      model,
    };
  }
}

export async function generateAnalyticsSnapshotForBusiness(
  businessId: string,
  period: ReportPeriodKey,
  options?: { force?: boolean }
): Promise<GenerateAnalyticsSnapshotResult> {
  const workspace = await getReportWorkspaceData(businessId);
  const report = buildReportsViewFromWorkspace(workspace);
  const periodView = report.periods[period];
  const promptPayload = buildAiPromptPayload({
    businessName: workspace.business.name,
    businessType: workspace.business.businessType,
    period,
    report,
  });
  const periodType = periodKeyToSnapshotPeriod(period);
  const periodStart = new Date(periodView.periodStart);
  const periodEnd = new Date(periodView.periodEnd);
  const existingSnapshot = await prisma.analyticsSnapshot.findUnique({
    where: {
      businessId_periodType_periodStart_periodEnd: {
        businessId,
        periodType,
        periodStart,
        periodEnd,
      },
    },
    select: {
      generatedAt: true,
      status: true,
      provider: true,
      model: true,
    },
  });

  if (
    !options?.force &&
    existingSnapshot &&
    Date.now() - existingSnapshot.generatedAt.getTime() < manualRefreshCooldownMs
  ) {
    const nextRefreshAt = new Date(
      existingSnapshot.generatedAt.getTime() + manualRefreshCooldownMs
    );

    return {
      ok: existingSnapshot.status === "GENERATED",
      period,
      usedAi: existingSnapshot.status === "GENERATED",
      rateLimited: true,
      nextRefreshAt: nextRefreshAt.toISOString(),
      message: `Insights were refreshed recently. Try again after ${nextRefreshAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}.`,
    };
  }

  try {
    const aiResult = await requestOpenAIInsight(promptPayload);

    if (!aiResult.ok) {
      await prisma.analyticsSnapshot.upsert({
        where: {
          businessId_periodType_periodStart_periodEnd: {
            businessId,
            periodType,
            periodStart,
            periodEnd,
          },
        },
        update: {
          kpiPayload: asJson(promptPayload),
          aiPayload: Prisma.JsonNull,
          provider: "rules",
          model: aiResult.model ?? null,
          status: "FALLBACK",
          error: aiResult.error,
          generatedAt: new Date(),
        },
        create: {
          businessId,
          periodType,
          periodStart,
          periodEnd,
          kpiPayload: asJson(promptPayload),
          aiPayload: Prisma.JsonNull,
          provider: "rules",
          model: aiResult.model ?? null,
          status: "FALLBACK",
          error: aiResult.error,
        },
      });

      return {
        ok: false,
        period,
        usedAi: false,
        message: "AI is unavailable right now, so reports are using rule-based insights.",
      };
    }

    await prisma.analyticsSnapshot.upsert({
      where: {
        businessId_periodType_periodStart_periodEnd: {
          businessId,
          periodType,
          periodStart,
          periodEnd,
        },
      },
      update: {
        kpiPayload: asJson(promptPayload),
        aiPayload: asJson(aiResult.payload),
        provider: "openai",
        model: aiResult.model,
        status: "GENERATED",
        error: null,
        generatedAt: new Date(),
      },
      create: {
        businessId,
        periodType,
        periodStart,
        periodEnd,
        kpiPayload: asJson(promptPayload),
        aiPayload: asJson(aiResult.payload),
        provider: "openai",
        model: aiResult.model,
        status: "GENERATED",
        error: null,
      },
    });

    return {
      ok: true,
      period,
      usedAi: true,
      message: "AI insight generated.",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI analytics generation failed.";

    await prisma.analyticsSnapshot.upsert({
      where: {
        businessId_periodType_periodStart_periodEnd: {
          businessId,
          periodType,
          periodStart,
          periodEnd,
        },
      },
      update: {
        kpiPayload: asJson(promptPayload),
        aiPayload: Prisma.JsonNull,
        provider: "rules",
        model: getAnalyticsModel(),
        status: "ERRORED",
        error: message,
        generatedAt: new Date(),
      },
      create: {
        businessId,
        periodType,
        periodStart,
        periodEnd,
        kpiPayload: asJson(promptPayload),
        aiPayload: Prisma.JsonNull,
        provider: "rules",
        model: getAnalyticsModel(),
        status: "ERRORED",
        error: message,
      },
    });

    return {
      ok: false,
      period,
      usedAi: false,
      message,
    };
  }
}

export async function generateAnalyticsSnapshotsForBusiness(businessId: string) {
  const results: GenerateAnalyticsSnapshotResult[] = [];
  const periods: ReportPeriodKey[] = ["daily", "weekly", "monthly"];

  for (const period of periods) {
    results.push(await generateAnalyticsSnapshotForBusiness(businessId, period, { force: true }));
  }

  return results;
}

export function reportPeriodKeyFromSnapshotPeriod(period: AnalyticsSnapshotPeriod) {
  return snapshotPeriodToPeriodKey(period);
}
