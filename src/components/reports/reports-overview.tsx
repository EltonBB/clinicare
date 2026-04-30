"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  Gauge,
  Minus,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";

import { refreshAnalyticsInsightsAction } from "@/app/(workspace)/reports/actions";
import { cn } from "@/lib/utils";
import type {
  ReportMetricTrend,
  ReportPeriodKey,
  ReportSnapshotTone,
  ReportsViewModel,
} from "@/lib/reports";

const metricTone: Record<ReportMetricTrend, string> = {
  up: "text-primary",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

const snapshotToneStyles: Record<ReportSnapshotTone, string> = {
  strong: "border-primary/25 bg-primary/8",
  healthy: "border-primary/18 bg-white",
  watch: "border-amber-300/50 bg-amber-50/72",
  attention: "border-destructive/25 bg-destructive/5",
};

const priorityStyles = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-primary/10 text-primary",
  low: "bg-secondary text-muted-foreground",
} as const;

function TrendIcon({ trend }: { trend: ReportMetricTrend }) {
  if (trend === "up") return <ArrowUpRight className="size-4" />;
  if (trend === "down") return <ArrowDownRight className="size-4" />;
  return <Minus className="size-4" />;
}

function buildLinePath(values: number[], width: number, height: number) {
  if (values.length === 0) return "";

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export function ReportsOverview({ view }: { view: ReportsViewModel }) {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriodKey>(view.defaultPeriod);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const router = useRouter();
  const period = view.periods[selectedPeriod];
  const chartValues = period.chart.points.map((point) => point.value);
  const linePath = useMemo(() => buildLinePath(chartValues, 620, 190), [chartValues]);
  const topMetrics = period.metrics.slice(0, 3);
  const secondaryMetrics = period.metrics.slice(3);

  function refreshInsights() {
    setIsRefreshing(true);
    setRefreshMessage(null);

    startTransition(async () => {
      const result = await refreshAnalyticsInsightsAction();
      setRefreshMessage(result.message);
      setIsRefreshing(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="section-reveal surface-card overflow-hidden rounded-[0.9rem]">
        <div className="flex flex-col gap-4 border-b border-border/80 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Clinic intelligence
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              Performance reports
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border bg-white p-1">
              {view.periodOrder.map((key) => {
                const item = view.periods[key];
                const selected = selectedPeriod === key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedPeriod(item.key)}
                    className={cn(
                      "rounded-[0.45rem] px-3 py-2 text-sm font-medium transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={refreshInsights}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
              Refresh AI analysis
            </button>
          </div>
        </div>

        <div className="border-b border-border/80 px-5 py-3">
          <div className="inline-flex items-center gap-2 rounded-md bg-primary/8 px-3 py-2 text-sm text-muted-foreground">
            <Brain className="size-4 text-primary" />
            Refresh reviews today, this week, and this month together.
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-3">
          {topMetrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[0.75rem] border border-border/75 bg-white px-5 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {metric.label}
              </p>
              <div className="mt-4 flex items-end justify-between gap-3">
                <p className="text-4xl font-semibold tracking-tight text-foreground">
                  {metric.value}
                </p>
                <p
                  className={cn(
                    "inline-flex items-center gap-1 text-sm font-medium",
                    metricTone[metric.trend]
                  )}
                >
                  <TrendIcon trend={metric.trend} />
                  {metric.delta}
                </p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{metric.helper}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <div className="space-y-6">
          <div className="section-reveal grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {secondaryMetrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[0.75rem] border border-border/75 bg-white/88 px-4 py-4 shadow-[0_14px_32px_rgba(20,32,51,0.035)]"
              >
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {metric.label}
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                  {metric.value}
                </p>
                <p
                  className={cn(
                    "mt-2 inline-flex items-center gap-1 text-xs font-medium",
                    metricTone[metric.trend]
                  )}
                >
                  <TrendIcon trend={metric.trend} />
                  {metric.delta}
                </p>
              </div>
            ))}
          </div>

          <div className="section-reveal surface-card rounded-[0.9rem] px-6 py-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{period.chart.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{period.chart.periodLabel}</p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
                <Gauge className="size-4 text-primary" />
                {period.comparisonLabel}
              </div>
            </div>

            <div className="mt-7">
              <svg
                viewBox="0 0 620 230"
                className="h-[300px] w-full"
                role="img"
                aria-label={period.chart.title}
              >
                {[0, 1, 2, 3].map((line) => (
                  <line
                    key={line}
                    x1="0"
                    x2="620"
                    y1={30 + line * 50}
                    y2={30 + line * 50}
                    stroke="rgba(20,32,51,0.08)"
                    strokeWidth="1"
                  />
                ))}

                <path
                  d={`${linePath} L 620 190 L 0 190 Z`}
                  fill="var(--primary-soft)"
                  transform="translate(0 15)"
                />
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="translate(0 15)"
                />

                {period.chart.points.map((point, index) => {
                  const max = Math.max(...chartValues, 1);
                  const min = Math.min(...chartValues, 0);
                  const range = Math.max(max - min, 1);
                  const x = (index / Math.max(period.chart.points.length - 1, 1)) * 620;
                  const y = 205 - ((point.value - min) / range) * 190;

                  return (
                    <g key={point.label}>
                      <circle cx={x} cy={y} r="5" fill="var(--primary)" />
                      <circle cx={x} cy={y} r="10" fill="var(--primary-shadow)" />
                      <text
                        x={x}
                        y="226"
                        textAnchor={
                          index === 0
                            ? "start"
                            : index === period.chart.points.length - 1
                              ? "end"
                              : "middle"
                        }
                        className="fill-muted-foreground text-[12px]"
                      >
                        {point.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        <aside
          className={cn(
            "section-reveal-delayed rounded-[0.9rem] border px-5 py-5 shadow-[0_20px_44px_rgba(20,32,51,0.05)]",
            snapshotToneStyles[period.snapshot.tone]
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Snapshot
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">
                {period.label} readout
              </h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-2 text-sm font-medium text-foreground">
              {period.snapshot.source === "ai" ? (
                <Brain className="size-4 text-primary" />
              ) : (
                <Sparkles className="size-4 text-primary" />
              )}
              {period.snapshot.score}/100
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-t border-border/80 pt-5">
            <div className="rounded-[0.7rem] bg-white/70 p-4">
              <p className="font-semibold text-foreground">{period.snapshot.headline}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {period.snapshot.summary}
              </p>
              {period.snapshot.diagnosis ? (
                <div className="mt-3 rounded-[0.65rem] border border-border/70 bg-white/75 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Diagnosis
                    </p>
                    {period.snapshot.severity ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em]",
                          priorityStyles[period.snapshot.severity]
                        )}
                      >
                        {period.snapshot.severity} severity
                      </span>
                    ) : null}
                    {period.snapshot.confidence ? (
                      <span className="rounded-full bg-secondary px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {period.snapshot.confidence} confidence
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {period.snapshot.diagnosis}
                  </p>
                </div>
              ) : null}
              {period.snapshot.deepDive ? (
                <p className="mt-3 border-t border-border/70 pt-3 text-sm leading-6 text-muted-foreground">
                  {period.snapshot.deepDive}
                </p>
              ) : null}
            </div>

            {period.snapshot.rootCauses?.length ? (
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Likely causes
                </p>
                {period.snapshot.rootCauses.map((cause) => (
                  <div
                    key={`${cause.title}-${cause.severity}`}
                    className="rounded-[0.7rem] border border-border/75 bg-white/75 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{cause.title}</p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em]",
                          priorityStyles[cause.severity]
                        )}
                      >
                        {cause.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {cause.evidence}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {period.snapshot.statHighlights?.length ? (
              <div className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Key stats
                </p>
                {period.snapshot.statHighlights.map((stat) => (
                  <div
                    key={`${stat.label}-${stat.value}`}
                    className="rounded-[0.7rem] border border-border/75 bg-white/75 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{stat.label}</p>
                      <p className="text-sm font-semibold text-primary">{stat.value}</p>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {stat.readout}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-3">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-1 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">What is working</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {period.snapshot.strength}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Activity className="mt-1 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">What needs attention</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {period.snapshot.watch}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Target className="mt-1 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Next move</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {period.snapshot.focus}
                  </p>
                </div>
              </div>
            </div>

            {period.snapshot.opportunities?.length ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Improvement opportunities
                </p>
                {period.snapshot.opportunities.map((opportunity) => (
                  <div
                    key={`${opportunity.title}-${opportunity.impact}`}
                    className="rounded-[0.7rem] border border-border/75 bg-white/80 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {opportunity.title}
                      </p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em]",
                          priorityStyles[opportunity.impact]
                        )}
                      >
                        {opportunity.impact}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {opportunity.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {period.snapshot.recommendedPlaybook ? (
              <div className="rounded-[0.7rem] border border-border/75 bg-white/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Recommended playbook
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {period.snapshot.recommendedPlaybook.name}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {period.snapshot.recommendedPlaybook.why}
                </p>
                <div className="mt-3 grid gap-2">
                  {period.snapshot.recommendedPlaybook.steps.map((step, index) => (
                    <div
                      key={`${step}-${index}`}
                      className="rounded-[0.6rem] bg-secondary/70 px-3 py-2 text-sm leading-6 text-muted-foreground"
                    >
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-2 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Suggested actions
              </p>
              {period.snapshot.actions?.map((action) => (
                <div
                  key={`${action.title}-${action.priority}`}
                  className="rounded-[0.7rem] border border-border/75 bg-white/80 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{action.title}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em]",
                        priorityStyles[action.priority]
                      )}
                    >
                      {action.priority}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {action.detail}
                  </p>
                  {action.metric || action.expectedImpact ? (
                    <div className="mt-3 grid gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                      {action.metric ? <p>Metric: {action.metric}</p> : null}
                      {action.expectedImpact ? (
                        <p>Expected impact: {action.expectedImpact}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {period.snapshot.whatToMonitor?.length ? (
              <div className="rounded-[0.7rem] border border-border/75 bg-white/75 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Watch next
                </p>
                <div className="mt-3 grid gap-2">
                  {period.snapshot.whatToMonitor.map((item) => (
                    <div
                      key={`${item.metric}-${item.target}`}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <p className="font-medium text-foreground">{item.metric}</p>
                      <p className="max-w-[55%] text-right leading-5 text-muted-foreground">
                        {item.target}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1">
                {period.snapshot.statusLabel}
              </span>
              {period.snapshot.model ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1">
                  {period.snapshot.model}
                </span>
              ) : null}
              {period.snapshot.generatedAt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1">
                  <CalendarDays className="size-3" />
                  {new Date(period.snapshot.generatedAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </div>

            <div className="rounded-[0.7rem] border border-border/75 bg-white/75 px-3 py-2 text-xs leading-5 text-muted-foreground">
              <p>{period.snapshot.auditLabel}</p>
              {period.snapshot.unavailableReason ? (
                <p className="mt-1">Reason: {period.snapshot.unavailableReason}</p>
              ) : null}
            </div>

            {refreshMessage ? (
              <p className="rounded-[0.7rem] border border-border/75 bg-white/75 px-3 py-2 text-sm text-muted-foreground">
                {refreshMessage}
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </div>
  );
}
