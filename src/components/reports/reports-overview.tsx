import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ReportMetricTrend, ReportsViewModel } from "@/lib/reports";

const metricTone: Record<ReportMetricTrend, string> = {
  up: "text-primary",
  down: "text-destructive",
  flat: "text-muted-foreground",
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
  const chartValues = view.chart.points.map((point) => point.value);
  const linePath = buildLinePath(chartValues, 520, 180);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Reports
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          {view.heading}
        </h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          {view.description}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {view.metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[0.95rem] border border-border bg-card px-5 py-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {metric.label}
            </p>
            <div className="mt-4 flex items-end justify-between gap-4">
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
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_320px]">
        <div className="rounded-[0.95rem] border border-border bg-card px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {view.chart.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {view.chart.periodLabel}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <svg
              viewBox="0 0 520 220"
              className="h-[260px] w-full"
              role="img"
              aria-label={view.chart.title}
            >
              {[0, 1, 2, 3].map((line) => (
                <line
                  key={line}
                  x1="0"
                  x2="520"
                  y1={25 + line * 48}
                  y2={25 + line * 48}
                  stroke="rgba(26,26,26,0.08)"
                  strokeWidth="1"
                />
              ))}

              <path
                d={`${linePath} L 520 180 L 0 180 Z`}
                fill="rgba(29,158,117,0.08)"
                transform="translate(0 20)"
              />
              <path
                d={linePath}
                fill="none"
                stroke="#1D9E75"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                transform="translate(0 20)"
              />

              {view.chart.points.map((point, index) => {
                const max = Math.max(...chartValues);
                const min = Math.min(...chartValues);
                const range = Math.max(max - min, 1);
                const x = (index / Math.max(view.chart.points.length - 1, 1)) * 520;
                const y = 200 - ((point.value - min) / range) * 180;

                return (
                  <g key={point.label}>
                    <circle cx={x} cy={y} r="5" fill="#1D9E75" />
                    <circle cx={x} cy={y} r="10" fill="rgba(29,158,117,0.12)" />
                    <text
                      x={x}
                      y="218"
                      textAnchor={index === 0 ? "start" : index === view.chart.points.length - 1 ? "end" : "middle"}
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

        <div className="space-y-4 rounded-[0.95rem] border border-border bg-card px-6 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Snapshot
            </p>
            <h2 className="mt-3 text-xl font-semibold text-foreground">
              Weekly readout
            </h2>
          </div>

          <div className="space-y-5 border-t border-border pt-5">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Top signal</p>
              <p className="text-sm leading-7 text-muted-foreground">
                {view.snapshot.topSignal}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">What to watch</p>
              <p className="text-sm leading-7 text-muted-foreground">
                {view.snapshot.watch}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Recommended focus</p>
              <p className="text-sm leading-7 text-muted-foreground">
                {view.snapshot.focus}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
