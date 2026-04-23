"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Gauge, Minus, Sparkles } from "lucide-react";

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
  strong: "border-primary/20 bg-primary/8 text-primary",
  healthy: "border-primary/15 bg-secondary/60 text-foreground",
  watch: "border-amber-300/40 bg-amber-50 text-amber-900",
  attention: "border-destructive/20 bg-destructive/5 text-destructive",
};

function TrendIcon({ trend }: { trend: ReportMetricTrend }) {
  if (trend === "up") {
    return <ArrowUpRight className="size-4" />;
  }

  if (trend === "down") {
    return <ArrowDownRight className="size-4" />;
  }

  return <Minus className="size-4" />;
}

function buildLinePath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return "";
  }

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
  const period = view.periods[selectedPeriod];
  const chartValues = period.chart.points.map((point) => point.value);
  const linePath = useMemo(() => buildLinePath(chartValues, 620, 190), [chartValues]);

  return (
    <div className="space-y-8">
      <div className="section-reveal space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Reports
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-[2.8rem]">
          {view.heading}
        </h1>
        <p className="max-w-4xl text-base leading-7 text-muted-foreground">
          {view.description}
        </p>
      </div>

      <section className="section-reveal grid gap-4 lg:grid-cols-3">
        {view.periodOrder.map((key) => {
          const item = view.periods[key];
          const selected = selectedPeriod === key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedPeriod(item.key)}
              className={cn(
                "rounded-[1.2rem] border px-5 py-5 text-left shadow-[0_18px_38px_rgba(20,32,51,0.04)] transition-[border-color,background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5",
                selected
                  ? "border-primary/30 bg-white shadow-[0_22px_44px_rgba(20,32,51,0.07)]"
                  : "border-border/80 bg-white/78 hover:border-primary/18"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                    {item.highlightValue}
                  </p>
                </div>
                <p
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium",
                    selected ? "bg-primary/10" : "bg-secondary/70",
                    metricTone[item.highlightTrend]
                  )}
                >
                  <TrendIcon trend={item.highlightTrend} />
                  {item.highlightChange}
                </p>
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">{item.rangeLabel}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {item.highlightSummary}
              </p>
            </button>
          );
        })}
      </section>

      <section className="section-reveal grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {period.metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[1.1rem] border border-border/80 bg-white/84 px-5 py-5 shadow-[0_18px_38px_rgba(20,32,51,0.04)]"
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
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{metric.helper}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="section-reveal rounded-[1.2rem] border border-border/80 bg-white/76 px-6 py-6 shadow-[0_24px_52px_rgba(20,32,51,0.05)] backdrop-blur-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{period.chart.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{period.chart.periodLabel}</p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-secondary/75 px-3 py-2 text-sm text-muted-foreground">
              <Gauge className="size-4 text-primary" />
              {period.comparisonLabel}
            </div>
          </div>

          <div className="mt-8">
            <svg
              viewBox="0 0 620 230"
              className="h-[280px] w-full"
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

        <aside
          className={cn(
            "section-reveal-delayed rounded-[1.2rem] border px-6 py-6 shadow-[0_24px_52px_rgba(20,32,51,0.05)] backdrop-blur-sm",
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
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 text-sm font-medium text-foreground">
              <Sparkles className="size-4 text-primary" />
              {period.snapshot.score}/100
            </div>
          </div>

          <div className="mt-5 space-y-5 border-t border-border/80 pt-5">
            <div className="space-y-2">
              <p className="text-base font-semibold text-foreground">{period.snapshot.headline}</p>
              <p className="text-sm leading-7 text-muted-foreground">{period.snapshot.summary}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">What is working</p>
              <p className="text-sm leading-7 text-muted-foreground">{period.snapshot.strength}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">What needs attention</p>
              <p className="text-sm leading-7 text-muted-foreground">{period.snapshot.watch}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Recommended next move</p>
              <p className="text-sm leading-7 text-muted-foreground">{period.snapshot.focus}</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
