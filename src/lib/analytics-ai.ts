import { Prisma, type AnalyticsSnapshotPeriod } from "@prisma/client";

import { buildReportsViewFromWorkspace, type ReportPeriodKey } from "@/lib/reports";
import { getReportWorkspaceData } from "@/lib/report-data";
import { prisma } from "@/lib/prisma";

const manualRefreshCooldownMs = 15 * 60 * 1000;
const analyticsRequestTimeoutMs = 50 * 1000;
const analyticsModelAttemptTimeoutMs = 22 * 1000;

const AI_PERIOD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "score",
    "tone",
    "headline",
    "summary",
    "diagnosis",
    "severity",
    "confidence",
    "strength",
    "watch",
    "focus",
    "deepDive",
    "rootCauses",
    "statHighlights",
    "opportunities",
    "recommendedPlaybook",
    "whatToMonitor",
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
    diagnosis: {
      type: "string",
      maxLength: 420,
    },
    severity: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
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
    deepDive: {
      type: "string",
      maxLength: 700,
    },
    rootCauses: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidence", "severity"],
        properties: {
          title: {
            type: "string",
            maxLength: 96,
          },
          evidence: {
            type: "string",
            maxLength: 240,
          },
          severity: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
        },
      },
    },
    statHighlights: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value", "readout"],
        properties: {
          label: {
            type: "string",
            maxLength: 72,
          },
          value: {
            type: "string",
            maxLength: 40,
          },
          readout: {
            type: "string",
            maxLength: 180,
          },
        },
      },
    },
    opportunities: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "impact"],
        properties: {
          title: {
            type: "string",
            maxLength: 96,
          },
          detail: {
            type: "string",
            maxLength: 240,
          },
          impact: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
        },
      },
    },
    recommendedPlaybook: {
      type: "object",
      additionalProperties: false,
      required: ["name", "why", "steps"],
      properties: {
        name: {
          type: "string",
          maxLength: 96,
        },
        why: {
          type: "string",
          maxLength: 240,
        },
        steps: {
          type: "array",
          minItems: 2,
          maxItems: 3,
          items: {
            type: "string",
            maxLength: 160,
          },
        },
      },
    },
    whatToMonitor: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["metric", "target"],
        properties: {
          metric: {
            type: "string",
            maxLength: 72,
          },
          target: {
            type: "string",
            maxLength: 120,
          },
        },
      },
    },
    actions: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "priority", "metric", "expectedImpact"],
        properties: {
          title: {
            type: "string",
            maxLength: 96,
          },
          detail: {
            type: "string",
            maxLength: 280,
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          metric: {
            type: "string",
            maxLength: 72,
          },
          expectedImpact: {
            type: "string",
            maxLength: 180,
          },
        },
      },
    },
  },
} as const;

const AI_SNAPSHOT_SCHEMA = AI_PERIOD_SCHEMA;

function getAnalyticsModel() {
  return process.env.OPENAI_ANALYTICS_MODEL?.trim() || "gpt-4.1-mini";
}

function getAnalyticsModels() {
  const candidates = [
    getAnalyticsModel(),
    process.env.OPENAI_ANALYTICS_FALLBACK_MODEL?.trim() || "gpt-4.1-mini",
    "gpt-4o-mini",
  ];

  return candidates.filter(
    (model, index): model is string => Boolean(model) && candidates.indexOf(model) === index
  );
}

function buildReasoningOptions(model: string) {
  return model.startsWith("gpt-5")
    ? {
        reasoning: {
          effort: "minimal",
        },
      }
    : {};
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
  const allTimeframes = buildAllTimeframesPayload(args.report);

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
    diagnostics: period.diagnostics,
    metrics: period.metrics.map((metric) => ({
      label: metric.label,
      value: metric.value,
      delta: metric.delta,
      trend: metric.trend,
      helper: metric.helper,
    })),
    trend: period.chart.points,
    allTimeframes,
    guardrails: {
      doNotInventNumbers: true,
      doNotMentionPatientsByName: true,
      recommendationStyle: "specific operational advice for a clinic owner",
    },
  };
}

function buildAllTimeframesPayload(report: ReturnType<typeof buildReportsViewFromWorkspace>) {
  const periods: ReportPeriodKey[] = ["daily", "weekly", "monthly"];

  return periods.reduce(
    (payload, key) => {
      const period = report.periods[key];

      payload[key] = {
        label: period.label,
        rangeLabel: period.rangeLabel,
        comparisonLabel: period.comparisonLabel,
        currentRuleSnapshot: period.snapshot,
        diagnostics: period.diagnostics,
        metrics: period.metrics.map((metric) => ({
          label: metric.label,
          value: metric.value,
          delta: metric.delta,
          trend: metric.trend,
          helper: metric.helper,
        })),
        trend: period.chart.points,
      };

      return payload;
    },
    {} as Record<ReportPeriodKey, unknown>
  );
}

async function requestOpenAIInsight(
  promptPayload: unknown,
  options?: {
    schema?: typeof AI_SNAPSHOT_SCHEMA;
    schemaName?: string;
    maxOutputTokens?: number;
  }
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false as const,
      error: "OPENAI_API_KEY is not configured.",
    };
  }

  const startedAt = Date.now();
  const models = getAnalyticsModels();
  let lastModel = models[0] ?? getAnalyticsModel();
  let lastError = "OpenAI analytics request failed.";

  for (const model of models) {
    lastModel = model;
    const remainingTimeoutMs = analyticsRequestTimeoutMs - (Date.now() - startedAt);

    if (remainingTimeoutMs < 5000) {
      lastError = "OpenAI analytics request timed out before a backup model could finish.";
      break;
    }

    try {
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
                "You are an operations analyst for small clinics. Interpret only the provided aggregate metrics and diagnostics. Diagnose operational causes, not medical conditions. Return practical, evidence-based recommendations in the requested JSON schema. Do not invent metrics, diagnose medical issues, or mention individual patients.",
            },
            {
              role: "user",
              content: JSON.stringify(promptPayload),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: options?.schemaName ?? "clinic_analytics_snapshot",
              strict: true,
              schema: options?.schema ?? AI_SNAPSHOT_SCHEMA,
            },
          },
          ...buildReasoningOptions(model),
          max_output_tokens: options?.maxOutputTokens ?? 1800,
        }),
        signal: AbortSignal.timeout(
          Math.min(analyticsModelAttemptTimeoutMs, remainingTimeoutMs)
        ),
        cache: "no-store",
      });

      if (!response.ok) {
        lastError = `OpenAI analytics request failed with ${response.status}.`;

        if (response.status === 401 || response.status === 403) {
          break;
        }

        continue;
      }

      const payload = (await response.json()) as unknown;
      const text = extractOpenAIText(payload);

      if (!text) {
        lastError = "OpenAI analytics response did not include structured text.";
        continue;
      }

      try {
        return {
          ok: true as const,
          model,
          payload: JSON.parse(text) as unknown,
        };
      } catch {
        lastError = "OpenAI analytics response was not valid JSON.";
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : "OpenAI analytics request failed.";
    }
  }

  return {
    ok: false as const,
    error: lastError,
    model: lastModel,
  };
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
    existingSnapshot.status === "GENERATED" &&
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
    const rawMessage =
      error instanceof Error
        ? error.message
        : "AI analytics generation failed.";
    const message =
      rawMessage.toLowerCase().includes("timeout") ||
      rawMessage.toLowerCase().includes("aborted")
        ? "AI analysis took too long, so reports are using rule-based insights. Try refreshing again in a minute."
        : rawMessage;

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

function allPeriodsRateLimited(results: GenerateAnalyticsSnapshotResult[]) {
  return results.length === 3 && results.every((result) => result.rateLimited);
}

async function upsertSnapshot(args: {
  businessId: string;
  period: ReportPeriodKey;
  report: ReturnType<typeof buildReportsViewFromWorkspace>;
  promptPayload: unknown;
  aiPayload: unknown;
  provider: string;
  model: string | null;
  status: "GENERATED" | "FALLBACK" | "ERRORED";
  error?: string | null;
}) {
  const periodView = args.report.periods[args.period];
  const periodType = periodKeyToSnapshotPeriod(args.period);
  const periodStart = new Date(periodView.periodStart);
  const periodEnd = new Date(periodView.periodEnd);
  const aiPayload = args.aiPayload === null ? Prisma.JsonNull : asJson(args.aiPayload);

  await prisma.analyticsSnapshot.upsert({
    where: {
      businessId_periodType_periodStart_periodEnd: {
        businessId: args.businessId,
        periodType,
        periodStart,
        periodEnd,
      },
    },
    update: {
      kpiPayload: asJson(args.promptPayload),
      aiPayload,
      provider: args.provider,
      model: args.model,
      status: args.status,
      error: args.error ?? null,
      generatedAt: new Date(),
    },
    create: {
      businessId: args.businessId,
      periodType,
      periodStart,
      periodEnd,
      kpiPayload: asJson(args.promptPayload),
      aiPayload,
      provider: args.provider,
      model: args.model,
      status: args.status,
      error: args.error ?? null,
    },
  });
}

async function getManualCooldownResults(args: {
  businessId: string;
  report: ReturnType<typeof buildReportsViewFromWorkspace>;
}) {
  const periods: ReportPeriodKey[] = ["daily", "weekly", "monthly"];
  const results: GenerateAnalyticsSnapshotResult[] = [];

  for (const period of periods) {
    const periodView = args.report.periods[period];
    const periodType = periodKeyToSnapshotPeriod(period);
    const periodStart = new Date(periodView.periodStart);
    const periodEnd = new Date(periodView.periodEnd);
    const existingSnapshot = await prisma.analyticsSnapshot.findUnique({
      where: {
        businessId_periodType_periodStart_periodEnd: {
          businessId: args.businessId,
          periodType,
          periodStart,
          periodEnd,
        },
      },
      select: {
        generatedAt: true,
        status: true,
      },
    });

    if (
      existingSnapshot &&
      existingSnapshot.status === "GENERATED" &&
      Date.now() - existingSnapshot.generatedAt.getTime() < manualRefreshCooldownMs
    ) {
      const nextRefreshAt = new Date(
        existingSnapshot.generatedAt.getTime() + manualRefreshCooldownMs
      );

      results.push({
        ok: existingSnapshot.status === "GENERATED",
        period,
        usedAi: existingSnapshot.status === "GENERATED",
        rateLimited: true,
        nextRefreshAt: nextRefreshAt.toISOString(),
        message: `Full AI analysis was refreshed recently. Try again after ${nextRefreshAt.toLocaleTimeString(
          [],
          {
            hour: "2-digit",
            minute: "2-digit",
          }
        )}.`,
      });
    }
  }

  return results;
}

export async function generateAnalyticsSnapshotsForBusiness(
  businessId: string,
  options?: { force?: boolean }
): Promise<GenerateAnalyticsSnapshotResult[]> {
  const workspace = await getReportWorkspaceData(businessId);
  const report = buildReportsViewFromWorkspace(workspace);
  const periods: ReportPeriodKey[] = ["daily", "weekly", "monthly"];
  const cooldownResults = options?.force
    ? []
    : await getManualCooldownResults({ businessId, report });

  if (allPeriodsRateLimited(cooldownResults)) {
    return cooldownResults;
  }

  const periodPromptPayloads = periods.reduce(
    (payloads, period) => {
      payloads[period] = buildAiPromptPayload({
        businessName: workspace.business.name,
        businessType: workspace.business.businessType,
        period,
        report,
      });

      return payloads;
    },
    {} as Record<ReportPeriodKey, unknown>
  );
  const rateLimitedPeriods = new Map(
    cooldownResults.map((result) => [result.period, result])
  );
  const periodsToRefresh = periods.filter((period) => !rateLimitedPeriods.has(period));

  try {
    const refreshedResults = await Promise.all(
      periodsToRefresh.map(async (period): Promise<GenerateAnalyticsSnapshotResult> => {
        const aiResult = await requestOpenAIInsight(periodPromptPayloads[period], {
          schema: AI_SNAPSHOT_SCHEMA,
          schemaName: `clinic_${period}_analytics_snapshot`,
          maxOutputTokens: 1400,
        });

        if (!aiResult.ok) {
          await upsertSnapshot({
            businessId,
            period,
            report,
            promptPayload: periodPromptPayloads[period],
            aiPayload: null,
            provider: "rules",
            model: aiResult.model ?? null,
            status: "FALLBACK",
            error: aiResult.error,
          });

          return {
            ok: false,
            period,
            usedAi: false,
            message: "AI is unavailable right now, so reports are using rule-based insights.",
          };
        }

        await upsertSnapshot({
          businessId,
          period,
          report,
          promptPayload: periodPromptPayloads[period],
          aiPayload: aiResult.payload,
          provider: "openai",
          model: aiResult.model,
          status: "GENERATED",
          error: null,
        });

        return {
          ok: true,
          period,
          usedAi: true,
          message: "AI insight generated.",
        };
      })
    );

    return periods.map(
      (period) =>
        rateLimitedPeriods.get(period) ??
        refreshedResults.find((result) => result.period === period) ?? {
          ok: false,
          period,
          usedAi: false,
          message: "AI refresh did not return a result for this timeframe.",
        }
    );
  } catch (error) {
    const rawMessage =
      error instanceof Error
        ? error.message
        : "AI analytics generation failed.";
    const message =
      rawMessage.toLowerCase().includes("timeout") ||
      rawMessage.toLowerCase().includes("aborted")
        ? "AI analysis took too long, so reports are using rule-based insights. Try refreshing again in a minute."
        : rawMessage;

    await Promise.all(
      periods.map((period) =>
        upsertSnapshot({
          businessId,
          period,
          report,
          promptPayload: periodPromptPayloads[period],
          aiPayload: null,
          provider: "rules",
          model: getAnalyticsModel(),
          status: "ERRORED",
          error: message,
        })
      )
    );

    return periods.map((period): GenerateAnalyticsSnapshotResult => ({
      ok: false,
      period,
      usedAi: false,
      message,
    }));
  }
}

export function reportPeriodKeyFromSnapshotPeriod(period: AnalyticsSnapshotPeriod) {
  return snapshotPeriodToPeriodKey(period);
}
