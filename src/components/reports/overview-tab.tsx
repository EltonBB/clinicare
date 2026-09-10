"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { m } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Minus,
} from "lucide-react";

import { KpiValue, useCountUp } from "@/components/workspace/kpi-value";
import { WorkspaceEmptyState } from "@/components/workspace/workspace-layout";
import { cn } from "@/lib/utils";
import { easeOutQuart, fadeIn, staggerChildren, staggerItem } from "@/lib/motion";
import type {
  ReportKpi,
  ReportMetricTrend,
  ReportPeriodView,
  ReportSnapshotTone,
} from "@/lib/reports";

const PLOT_TOP = 14;
const PLOT_HEIGHT = 168;
const PLOT_BOTTOM = PLOT_TOP + PLOT_HEIGHT;
const PLOT_LEFT = 34;
const LABEL_Y = 212;
const CHART_VIEWBOX_HEIGHT = 220;

const deltaPillStyles: Record<ReportMetricTrend, string> = {
  up: "bg-emerald-50 text-emerald-600",
  down: "bg-red-50 text-red-600",
  flat: "bg-secondary text-muted-foreground",
};

const snapshotToneColor: Record<ReportSnapshotTone, string> = {
  strong: "#10b981",
  healthy: "var(--primary)",
  watch: "#f59e0b",
  attention: "#ef4444",
};

const snapshotToneLabel: Record<ReportSnapshotTone, string> = {
  strong: "Strong",
  healthy: "Healthy",
  watch: "Needs watching",
  attention: "Needs attention",
};

const priorityStyles = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-primary/10 text-primary",
  low: "bg-secondary text-muted-foreground",
} as const;

function TrendIcon({ trend }: { trend: ReportMetricTrend }) {
  if (trend === "up") return <ArrowUpRight className="size-3" />;
  if (trend === "down") return <ArrowDownRight className="size-3" />;
  return <Minus className="size-3" />;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

// Monotone cubic interpolation (Fritsch–Carlson): smooth curve with no
// overshoot below the baseline on flat-to-rising data.
function buildSmoothPath(values: number[], width: number, height: number, maxOverride?: number) {
  const n = values.length;
  if (n === 0) return "";

  const max = Math.max(maxOverride ?? Math.max(...values), 1);
  const xs = values.map((_, index) => (index / Math.max(n - 1, 1)) * width);
  const ys = values.map((value) => height - (value / max) * height);

  if (n === 1) return `M ${round2(xs[0])} ${round2(ys[0])}`;
  if (n === 2) {
    return `M ${round2(xs[0])} ${round2(ys[0])} L ${round2(xs[1])} ${round2(ys[1])}`;
  }

  const dxs: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dxs.push(xs[i + 1] - xs[i]);
    slopes.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  }

  const tangents: number[] = [slopes[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      tangents.push(0);
    } else {
      const w1 = 2 * dxs[i] + dxs[i - 1];
      const w2 = dxs[i] + 2 * dxs[i - 1];
      tangents.push((w1 + w2) / (w1 / slopes[i - 1] + w2 / slopes[i]));
    }
  }
  tangents.push(slopes[n - 2]);

  let path = `M ${round2(xs[0])} ${round2(ys[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const cx1 = xs[i] + dxs[i] / 3;
    const cy1 = ys[i] + (tangents[i] * dxs[i]) / 3;
    const cx2 = xs[i + 1] - dxs[i] / 3;
    const cy2 = ys[i + 1] - (tangents[i + 1] * dxs[i]) / 3;
    path += ` C ${round2(cx1)} ${round2(cy1)}, ${round2(cx2)} ${round2(cy2)}, ${round2(xs[i + 1])} ${round2(ys[i + 1])}`;
  }

  return path;
}

function capitalize(value: string) {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

function statusColor(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("completed")) return "var(--primary)";
  if (normalized.includes("cancelled")) return "#ef4444";
  if (normalized.includes("pending")) return "#f59e0b";
  if (normalized.includes("confirmed")) return "#5b57d6";
  return "#94a3b8";
}

// A stale hover from the previous period/range must not survive a period
// switch or a custom-range change — periodStart/periodEnd change on both,
// even when `period.key` stays "custom" across two different date ranges.
// Adjusting state during render (React's documented pattern for this,
// rather than an effect) avoids an extra commit-then-reset render pass.
function useResetOnPeriodChange(period: ReportPeriodView, onReset: () => void) {
  const periodIdentity = `${period.periodStart}|${period.periodEnd}`;
  const [lastPeriodIdentity, setLastPeriodIdentity] = useState(periodIdentity);
  if (periodIdentity !== lastPeriodIdentity) {
    setLastPeriodIdentity(periodIdentity);
    onReset();
  }
}

export function OverviewTab({ period }: { period: ReportPeriodView }) {
  const [chartHover, setChartHover] = useState<number | null>(null);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(820);
  const chartAreaRef = useRef<HTMLDivElement | null>(null);
  const chartGradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  useResetOnPeriodChange(period, () => {
    setChartHover(null);
    setActiveKpi(null);
  });

  const chartPoints = period.chart.points;
  const chartCompletedValues = period.chart.completedValues;
  const chartPreviousValues = period.chart.previousValues;
  const chartValues = useMemo(() => chartPoints.map((point) => point.value), [chartPoints]);
  // Scale is derived from the current period only — if a previous-period
  // bucket spikes above it, that segment of the ghost line clips at the top
  // of the plot rather than compressing today's real trend down to fit it.
  const maxChartValue = useMemo(() => Math.max(...chartValues, 1), [chartValues]);
  const plotWidth = Math.max(chartWidth - PLOT_LEFT, 80);
  const linePath = useMemo(
    () => buildSmoothPath(chartValues, plotWidth, PLOT_HEIGHT, maxChartValue),
    [chartValues, plotWidth, maxChartValue]
  );
  const completedLinePath = useMemo(
    () => buildSmoothPath(chartCompletedValues, plotWidth, PLOT_HEIGHT, maxChartValue),
    [chartCompletedValues, plotWidth, maxChartValue]
  );
  const previousLinePath = useMemo(
    () => buildSmoothPath(chartPreviousValues, plotWidth, PLOT_HEIGHT, maxChartValue),
    [chartPreviousValues, plotWidth, maxChartValue]
  );
  const yTicks = maxChartValue >= 2 ? [maxChartValue, maxChartValue / 2, 0] : [maxChartValue, 0];
  const kpiByKey = new Map(period.kpis.map((kpi) => [kpi.key, kpi]));
  const appointmentsKpi = kpiByKey.get("appointments");
  const completionKpi = kpiByKey.get("completionRate");
  const newClientsKpi = kpiByKey.get("newClients");
  const utilizationKpi = kpiByKey.get("utilization");
  const topCause = period.snapshot.rootCauses?.[0];
  const primaryAction = period.snapshot.actions?.[0];
  const avgVisitKpi = kpiByKey.get("avgVisitLength");
  const repeatVisitRow = period.operationalDetail.find((row) => row.key === "repeatVisit");
  const lostSlotRow = period.operationalDetail.find((row) => row.key === "lostSlot");
  const followUpRow = period.operationalDetail.find((row) => row.key === "followUp");
  const busiestDay = period.diagnostics.demandWindows.busiestDays[0];
  const quietestDay = period.diagnostics.demandWindows.quietestDays[0];

  const completionDetailParts = [
    lostSlotRow?.value ? `Lost-slot rate: ${lostSlotRow.value} of finalized visits were cancelled.` : null,
    followUpRow?.value ? `Follow-up coverage: ${followUpRow.value} of inbound messages got an outbound reply.` : null,
    avgVisitKpi?.value ? `Average visit length: ${avgVisitKpi.value}.` : null,
    repeatVisitRow?.value ? `${repeatVisitRow.value} of clients return for another visit.` : null,
  ].filter((part): part is string => Boolean(part));

  const kpiDetails: Record<string, string> = {
    appointments:
      busiestDay && busiestDay.count > 0
        ? `Busiest day this period: ${busiestDay.label} (${busiestDay.count} visit${busiestDay.count === 1 ? "" : "s"}).${
            quietestDay && quietestDay.label !== busiestDay.label
              ? ` Quietest: ${quietestDay.label} (${quietestDay.count}).`
              : ""
          }`
        : "No appointments booked yet this period to break down by day.",
    completionRate:
      completionDetailParts.length > 0
        ? completionDetailParts.join(" ")
        : "Not enough finalized visits or inbound messages yet to break this down further.",
    newClients: `${period.activeClients.toLocaleString("en-US")} of ${period.clientMixTotal.toLocaleString("en-US")} total client records are currently active.`,
    utilization:
      "Booked minutes vs. open hours × active staff, estimated — not a measured clock-in/clock-out figure. 70-92% is the healthy operating range; below that means open capacity isn't converting into visits, above it risks overload.",
  };

  useEffect(() => {
    const element = chartAreaRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setChartWidth(Math.round(width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <m.div key={period.key} variants={fadeIn} initial="initial" animate="animate" className="space-y-3">
      <m.div variants={staggerChildren} initial="initial" animate="animate" className="grid gap-3 md:grid-cols-4">
        {(
          [
            { key: "appointments", kpi: appointmentsKpi },
            { key: "completionRate", kpi: completionKpi },
            { key: "newClients", kpi: newClientsKpi },
            { key: "utilization", kpi: utilizationKpi },
          ] as const
        ).map(({ key, kpi }) =>
          kpi ? (
            <KpiCard
              key={key}
              kpi={kpi}
              active={activeKpi === key}
              onToggle={() => setActiveKpi((current) => (current === key ? null : key))}
              detail={kpiDetails[key]}
            />
          ) : null
        )}
      </m.div>

      {activeKpi ? (
        <div className="state-pop hidden rounded-(--radius-card) border border-dashed border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground md:block">
          {kpiDetails[activeKpi]}
        </div>
      ) : null}

      <div className="grid items-stretch gap-3 xl:grid-cols-2">
        <section className="surface-card flex flex-col p-3.5">
          <div className="flex items-start justify-between gap-3 px-1">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Performance</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{period.chart.periodLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" />
                Appointments
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3.5 rounded-full border-t-2 border-dashed border-primary/70" />
                Completed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3.5 rounded-full border-t-2 border-dotted border-muted-foreground/70" />
                Previous period
              </span>
            </div>
          </div>
          <div ref={chartAreaRef} className="mt-3 flex flex-1 flex-col justify-end">
            {period.chart.hasData ? (
              <div className="relative" onMouseLeave={() => setChartHover(null)}>
                <svg
                  viewBox={`0 0 ${chartWidth} ${CHART_VIEWBOX_HEIGHT}`}
                  className="block h-auto w-full"
                  role="img"
                  aria-label={period.chart.title}
                >
                  <defs>
                    <linearGradient id={chartGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  {yTicks.map((tick) => {
                    const y = PLOT_TOP + (1 - tick / maxChartValue) * PLOT_HEIGHT;

                    return (
                      <g key={tick}>
                        <line x1={PLOT_LEFT} x2={chartWidth} y1={y} y2={y} stroke="rgba(20,21,47,0.06)" strokeWidth="1" />
                        <text x={PLOT_LEFT - 8} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                          {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}
                  <m.path
                    d={`${linePath} L ${plotWidth} ${PLOT_HEIGHT} L 0 ${PLOT_HEIGHT} Z`}
                    fill={`url(#${chartGradientId})`}
                    transform={`translate(${PLOT_LEFT} ${PLOT_TOP})`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
                  />
                  <path
                    d={previousLinePath}
                    fill="none"
                    stroke="var(--muted-foreground)"
                    strokeOpacity="0.45"
                    strokeDasharray="2 4"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    transform={`translate(${PLOT_LEFT} ${PLOT_TOP})`}
                  />
                  <m.path
                    d={linePath}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    transform={`translate(${PLOT_LEFT} ${PLOT_TOP})`}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                  <m.path
                    d={completedLinePath}
                    fill="none"
                    stroke="var(--primary)"
                    strokeOpacity="0.5"
                    strokeDasharray="6 6"
                    strokeWidth="2"
                    strokeLinecap="round"
                    transform={`translate(${PLOT_LEFT} ${PLOT_TOP})`}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                  {period.chart.points.map((point, index) => {
                    const x = PLOT_LEFT + (index / Math.max(period.chart.points.length - 1, 1)) * plotWidth;
                    const y = PLOT_BOTTOM - (point.value / maxChartValue) * PLOT_HEIGHT;
                    const completedY =
                      PLOT_BOTTOM - ((period.chart.completedValues[index] ?? 0) / maxChartValue) * PLOT_HEIGHT;
                    const hovered = chartHover === index;

                    return (
                      <g key={`${point.label}-${index}`}>
                        {hovered ? (
                          <>
                            <line
                              x1={x}
                              x2={x}
                              y1={PLOT_TOP}
                              y2={PLOT_BOTTOM}
                              stroke="color-mix(in srgb, var(--primary) 18%, transparent)"
                              strokeWidth="1"
                              strokeDasharray="3 3"
                            />
                            <circle cx={x} cy={completedY} r={3.5} fill="var(--primary)" fillOpacity="0.55" stroke="white" strokeWidth="1.5" />
                            <circle cx={x} cy={y} r={5} fill="var(--primary)" stroke="white" strokeWidth="2" />
                          </>
                        ) : null}
                        <text
                          x={x}
                          y={LABEL_Y}
                          textAnchor={index === period.chart.points.length - 1 ? "end" : "middle"}
                          className={cn("text-[11px]", hovered ? "fill-foreground font-medium" : "fill-muted-foreground")}
                        >
                          {point.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div
                  className="absolute right-0 top-0 grid h-[182px]"
                  style={{ left: PLOT_LEFT, gridTemplateColumns: `repeat(${period.chart.points.length}, 1fr)` }}
                >
                  {period.chart.points.map((_, index) => (
                    <div key={index} onMouseEnter={() => setChartHover(index)} />
                  ))}
                </div>

                {chartHover !== null && period.chart.points[chartHover] ? (
                  <div
                    className={cn(
                      "pointer-events-none absolute top-0 z-10 rounded-(--radius-tile) border border-border/80 bg-white px-2.5 py-1.5 shadow-[0_8px_20px_rgba(20,21,47,0.1)]",
                      chartHover === 0 ? "" : chartHover === period.chart.points.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
                    )}
                    style={{ left: PLOT_LEFT + (chartHover / Math.max(period.chart.points.length - 1, 1)) * plotWidth }}
                  >
                    <p className="text-xs font-semibold text-foreground">{period.chart.points[chartHover].label}</p>
                    <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
                      {period.chart.points[chartHover].value}{" "}
                      {period.chart.points[chartHover].value === 1 ? "appointment" : "appointments"}
                      <span className="mx-1">·</span>
                      {period.chart.completedValues[chartHover] ?? 0} completed
                      <span className="mx-1">·</span>
                      {chartPreviousValues[chartHover] ?? 0} previous period
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <WorkspaceEmptyState
                compact
                icon={CalendarDays}
                title="No appointment trend yet"
                description="The trend appears once appointments are booked in this period."
              />
            )}
          </div>
        </section>

        <section className="surface-card flex flex-col p-3.5">
          <div className="flex items-center justify-between gap-3 px-1">
            <h2 className="text-[15px] font-semibold text-foreground">AI insight</h2>
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                period.snapshot.status === "generated" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
              )}
            >
              {period.snapshot.statusLabel}
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-3 rounded-(--radius-tile) border border-border/70 bg-secondary/25 px-3 py-2.5">
            <ScoreGauge score={period.snapshot.score} tone={period.snapshot.tone} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{snapshotToneLabel[period.snapshot.tone]}</p>
              <p className="text-xs text-muted-foreground">Operational health score: {period.snapshot.score}/100</p>
            </div>
          </div>

          <div className="mt-2 flex-1 space-y-1">
            <InsightRow label="Summary" title={period.snapshot.headline} text={period.snapshot.summary} />
            <InsightRow
              label="Diagnosis"
              badge={topCause ? capitalize(topCause.severity) : undefined}
              badgeTone={topCause?.severity}
              title={topCause?.title ?? period.snapshot.diagnosis ?? "No diagnosis recorded yet"}
              text={topCause?.evidence}
            />
            <InsightRow
              label="Next move"
              badge={primaryAction ? capitalize(primaryAction.priority) : undefined}
              badgeTone={primaryAction?.priority}
              title={primaryAction?.title ?? period.snapshot.focus}
              text={primaryAction?.detail}
            />
          </div>
        </section>
      </div>
    </m.div>
  );
}

export function AppointmentStatusCard({ period }: { period: ReportPeriodView }) {
  const [statusHover, setStatusHover] = useState<string | null>(null);
  useResetOnPeriodChange(period, () => setStatusHover(null));

  const statusMix = period.diagnostics.statusMix;
  const hoveredStatus = statusMix.find((item) => item.label === statusHover);

  return (
    <m.section
      key={period.key}
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="surface-card flex h-full flex-col p-3.5"
    >
      <h2 className="px-1 text-[15px] font-semibold text-foreground">Appointment status</h2>
      {period.statusTotal > 0 ? (
        <div className="mt-2 flex flex-1 items-center justify-center gap-6 px-1 py-2">
          <div className="relative shrink-0" onMouseLeave={() => setStatusHover(null)}>
            <DonutChart items={statusMix} hovered={statusHover} onHover={setStatusHover} />
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-xl font-semibold leading-6 tabular-nums text-foreground">
                  {hoveredStatus ? hoveredStatus.count : period.statusTotal}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {hoveredStatus ? hoveredStatus.label.toLowerCase() : "visits"}
                </p>
              </div>
            </div>
          </div>
          <div className="min-w-0" onMouseLeave={() => setStatusHover(null)}>
            {statusMix.map((item) => (
              <LegendRow
                key={item.label}
                color={statusColor(item.label)}
                label={item.label}
                detail={item.share.replace(/\.0%$/, "%")}
                muted={item.count === 0}
                dimmed={statusHover !== null && statusHover !== item.label}
                onHover={() => setStatusHover(item.label)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex-1">
          <WorkspaceEmptyState compact icon={CheckCircle2} title="No status mix yet" description="Statuses appear after visits are booked." />
        </div>
      )}
    </m.section>
  );
}

export function HighlightsCard({ period }: { period: ReportPeriodView }) {
  const avgVisitKpi = period.kpis.find((kpi) => kpi.key === "avgVisitLength");
  const repeatVisitRow = period.operationalDetail.find((row) => row.key === "repeatVisit");
  const lostSlotRow = period.operationalDetail.find((row) => row.key === "lostSlot");
  const followUpRow = period.operationalDetail.find((row) => row.key === "followUp");

  const highlights = [
    avgVisitKpi && avgVisitKpi.value
      ? { title: "Average visit length", detail: `Completed visits average ${avgVisitKpi.value} this period.` }
      : null,
    repeatVisitRow && repeatVisitRow.value
      ? { title: "Repeat-visit rate", detail: `${repeatVisitRow.value} of clients return for another visit.` }
      : null,
    lostSlotRow && lostSlotRow.value
      ? { title: "Lost-slot rate", detail: `${lostSlotRow.value} of finalized visits were cancelled.` }
      : null,
    followUpRow && followUpRow.value
      ? { title: "Follow-up coverage", detail: `${followUpRow.value} of inbound messages got an outbound reply.` }
      : null,
    period.clientMixTotal > 0
      ? {
          title: "Active clients",
          detail: `${period.activeClients.toLocaleString("en-US")} of ${period.clientMixTotal.toLocaleString("en-US")} client records are currently active.`,
        }
      : null,
  ].filter((item): item is { title: string; detail: string } => Boolean(item));

  return (
    <m.section
      key={period.key}
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="surface-card flex h-full flex-col p-3.5"
    >
      <h2 className="px-1 pb-2 text-[15px] font-semibold text-foreground">Highlights</h2>
      {highlights.length > 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-2">
          {highlights.map((highlight) => (
            <div key={highlight.title} className="rounded-(--radius-tile) border border-border/70 px-3 py-2.5">
              <p className="text-sm font-medium text-foreground">{highlight.title}</p>
              <p className="truncate text-xs text-muted-foreground">{highlight.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1">
          <WorkspaceEmptyState compact icon={CalendarDays} title="No activity pattern yet" description="Highlights appear once visits are completed." />
        </div>
      )}
    </m.section>
  );
}

function DonutChart({
  items,
  hovered,
  onHover,
}: {
  items: Array<{ label: string; count: number }>;
  hovered: string | null;
  onHover: (label: string) => void;
}) {
  const size = 148;
  const strokeWidth = 14;
  const center = size / 2;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const nonZero = items.filter((item) => item.count > 0);
  // The per-arc stagger delay below is for the mount reveal only — without
  // this guard, every hover-driven opacity change would reuse the same
  // delayed transition, making dimming lag behind the cursor instead of
  // responding instantly.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setHasMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const pcts = nonZero.map((item) => (item.count / total) * 100);
  const arcs = nonZero.map((item, index) => ({
    item,
    pct: pcts[index],
    start: pcts.slice(0, index).reduce((sum, pct) => sum + pct, 0),
  }));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      {arcs.map(({ item, pct, start: arcStart }, index) => (
        <m.circle
          key={item.label}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={statusColor(item.label)}
          strokeWidth={strokeWidth}
          strokeDasharray={`${(pct / 100) * circumference - (arcs.length > 1 ? 2 : 0)} ${circumference}`}
          strokeDashoffset={-((arcStart / 100) * circumference)}
          initial={{ opacity: 0 }}
          animate={{ opacity: hovered && hovered !== item.label ? 0.25 : 1 }}
          transition={{
            duration: 0.35,
            ease: easeOutQuart,
            delay: hasMounted ? 0 : index * 0.08,
          }}
          onMouseEnter={() => onHover(item.label)}
          className="cursor-default"
        />
      ))}
    </svg>
  );
}

function ScoreGauge({ score, tone }: { score: number; tone: ReportSnapshotTone }) {
  const color = snapshotToneColor[tone];
  // Same rAF/ease-out-quart count-up KpiValue uses (shared hook), driving the
  // ring and the number together — eases from whatever score last settled at
  // rather than always from 0, so a score change without a remount (e.g. two
  // custom date ranges in a row) animates cleanly between the two numbers.
  const displayScore = Math.round(useCountUp(score));

  return (
    <div
      className="grid size-14 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${displayScore}%, var(--secondary) 0)` }}
    >
      <div className="grid size-11 place-items-center rounded-full bg-white">
        <span className="text-base font-semibold tabular-nums text-foreground">{displayScore}</span>
      </div>
    </div>
  );
}

function KpiCard({
  kpi,
  onToggle,
  active = false,
  detail,
}: {
  kpi: ReportKpi;
  onToggle?: () => void;
  active?: boolean;
  detail?: string;
}) {
  return (
    <m.section
      variants={staggerItem}
      className={cn(
        "card-hover flex flex-col rounded-(--radius-card) border bg-white shadow-(--shadow-card)",
        active ? "border-primary/45 ring-1 ring-primary/20" : "border-border/80"
      )}
    >
      <div
        onClick={onToggle}
        role={onToggle ? "button" : undefined}
        tabIndex={onToggle ? 0 : undefined}
        aria-expanded={onToggle ? active : undefined}
        onKeyDown={
          onToggle
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
        className={cn(
          "flex flex-1 items-stretch",
          onToggle && "cursor-pointer transition-transform duration-(--duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.98]"
        )}
      >
        <div className="flex flex-1 flex-col p-3.5">
          <p className="truncate text-sm font-medium whitespace-nowrap text-muted-foreground">{kpi.label}</p>
          <div className="mt-auto pt-2.5">
            <p className="text-[1.6rem] font-semibold leading-8 tracking-tight text-foreground">
              {kpi.value ? <KpiValue key={kpi.value} value={kpi.value} /> : "—"}
            </p>
            <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap">
              {kpi.delta ? (
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", deltaPillStyles[kpi.trend])}>
                  <TrendIcon trend={kpi.trend} />
                  {kpi.delta}
                </span>
              ) : null}
              {kpi.helper ? <span className="text-xs text-muted-foreground">{kpi.helper}</span> : null}
            </div>
          </div>
        </div>
      </div>
      {/* Mobile only: the grid is single-column below md, so a shared panel after
          all 4 cards loses the tap-to-explanation connection. Desktop keeps the
          one shared panel below the 4-across row instead (see OverviewTab). */}
      {active && detail ? (
        <div className="state-pop bg-primary/5 px-3.5 py-2.5 text-sm text-foreground md:hidden">
          {detail}
        </div>
      ) : null}
    </m.section>
  );
}

// Dims every row except the hovered one, rather than tinting the active row's
// background — the legend cross-highlight read from 21st.dev's Sectors Donut.
export function LegendRow({
  color,
  label,
  detail,
  muted,
  dimmed,
  onHover,
}: {
  color: string;
  label: string;
  detail?: string;
  muted?: boolean;
  // true only while a *different* row is hovered — distinct from "nothing is
  // hovered", which must leave every row at full opacity.
  dimmed?: boolean;
  onHover?: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onFocus={onHover}
      className="-mx-1.5 flex w-full items-center gap-2.5 rounded-(--radius-tile) px-1.5 py-[7px] text-left transition-opacity duration-(--duration-base)"
      style={{ opacity: dimmed ? 0.35 : 1 }}
    >
      <span className={cn("size-2 shrink-0 rounded-full", muted && "opacity-35")} style={{ background: color }} />
      <span className={cn("w-[92px] truncate text-sm", muted ? "text-muted-foreground/60" : "text-muted-foreground")}>
        {label}
      </span>
      {detail ? (
        <span className={cn("shrink-0 text-sm font-medium tabular-nums", muted ? "text-muted-foreground/60" : "text-foreground")}>
          {detail}
        </span>
      ) : null}
    </button>
  );
}

function InsightRow({
  label,
  badge,
  badgeTone,
  title,
  text,
}: {
  label: string;
  badge?: string;
  badgeTone?: "high" | "medium" | "low";
  title: string;
  text?: string;
}) {
  return (
    <div className="rounded-(--radius-tile) px-1 py-1.5 transition-colors duration-(--duration-base) hover:bg-secondary/30">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {badge ? <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", priorityStyles[badgeTone ?? "medium"])}>{badge}</span> : null}
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-5 text-foreground">{title}</p>
      {text ? <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-muted-foreground">{text}</p> : null}
    </div>
  );
}
