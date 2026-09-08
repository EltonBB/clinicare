"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { m } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Gauge,
  Minus,
  Sparkles,
  Target,
  UserPlus,
} from "lucide-react";

import { WorkspaceEmptyState } from "@/components/workspace/workspace-layout";
import { cn } from "@/lib/utils";
import { fadeIn, staggerChildren, staggerItem } from "@/lib/motion";
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

const kpiIcons: Record<string, typeof CalendarDays> = {
  appointments: CalendarDays,
  completionRate: CheckCircle2,
  newClients: UserPlus,
  utilization: Gauge,
};

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

export function OverviewTab({ period }: { period: ReportPeriodView }) {
  const [chartHover, setChartHover] = useState<number | null>(null);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(820);
  const chartAreaRef = useRef<HTMLDivElement | null>(null);
  const chartGradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  // A stale hover from the previous period/range must not survive a period
  // switch or a custom-range change — periodStart/periodEnd change on both,
  // even when `period.key` stays "custom" across two different date ranges.
  // Adjusting state during render (React's documented pattern for this,
  // rather than an effect) avoids an extra commit-then-reset render pass.
  const periodIdentity = `${period.periodStart}|${period.periodEnd}`;
  const [lastPeriodIdentity, setLastPeriodIdentity] = useState(periodIdentity);
  if (periodIdentity !== lastPeriodIdentity) {
    setLastPeriodIdentity(periodIdentity);
    setChartHover(null);
    setActiveKpi(null);
  }

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
        {appointmentsKpi ? (
          <KpiCard
            kpi={appointmentsKpi}
            active={activeKpi === "appointments"}
            onToggle={() => setActiveKpi((current) => (current === "appointments" ? null : "appointments"))}
            detail={kpiDetails.appointments}
          />
        ) : null}
        {completionKpi ? (
          <KpiCard
            kpi={completionKpi}
            active={activeKpi === "completionRate"}
            onToggle={() => setActiveKpi((current) => (current === "completionRate" ? null : "completionRate"))}
            detail={kpiDetails.completionRate}
          />
        ) : null}
        {newClientsKpi ? (
          <KpiCard
            kpi={newClientsKpi}
            active={activeKpi === "newClients"}
            onToggle={() => setActiveKpi((current) => (current === "newClients" ? null : "newClients"))}
            detail={kpiDetails.newClients}
          />
        ) : null}
        {utilizationKpi ? (
          <KpiCard
            kpi={utilizationKpi}
            active={activeKpi === "utilization"}
            onToggle={() => setActiveKpi((current) => (current === "utilization" ? null : "utilization"))}
            detail={kpiDetails.utilization}
          />
        ) : null}
      </m.div>

      {activeKpi ? (
        <div className="state-pop hidden rounded-(--radius-card) border border-dashed border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground md:block">
          {kpiDetails[activeKpi]}
        </div>
      ) : null}

      <div className="grid items-stretch gap-3 xl:grid-cols-2">
        <section className="flex flex-col rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-card)">
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
                  <path
                    d={`${linePath} L ${plotWidth} ${PLOT_HEIGHT} L 0 ${PLOT_HEIGHT} Z`}
                    fill={`url(#${chartGradientId})`}
                    transform={`translate(${PLOT_LEFT} ${PLOT_TOP})`}
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
                  <path
                    d={linePath}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    transform={`translate(${PLOT_LEFT} ${PLOT_TOP})`}
                  />
                  <path
                    d={completedLinePath}
                    fill="none"
                    stroke="var(--primary)"
                    strokeOpacity="0.5"
                    strokeDasharray="6 6"
                    strokeWidth="2"
                    strokeLinecap="round"
                    transform={`translate(${PLOT_LEFT} ${PLOT_TOP})`}
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

        <section className="flex flex-col rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-card)">
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
            <InsightRow icon={Sparkles} label="Summary" title={period.snapshot.headline} text={period.snapshot.summary} />
            <InsightRow
              icon={AlertTriangle}
              label="Diagnosis"
              badge={topCause ? capitalize(topCause.severity) : undefined}
              badgeTone={topCause?.severity}
              title={topCause?.title ?? period.snapshot.diagnosis ?? "No diagnosis recorded yet"}
              text={topCause?.evidence}
            />
            <InsightRow
              icon={Target}
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

function ScoreGauge({ score, tone }: { score: number; tone: ReportSnapshotTone }) {
  const color = snapshotToneColor[tone];

  return (
    <div
      className="grid size-14 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${score}%, var(--secondary) 0)` }}
    >
      <div className="grid size-11 place-items-center rounded-full bg-white">
        <span className="text-base font-semibold tabular-nums text-foreground">{score}</span>
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
  const Icon = kpiIcons[kpi.key] ?? CalendarDays;

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
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
              <Icon className="size-4" />
            </span>
            <p className="truncate text-sm font-medium whitespace-nowrap text-muted-foreground">{kpi.label}</p>
          </div>
          <div className="mt-auto pt-2.5">
            <p className="text-[1.6rem] font-semibold leading-8 tracking-tight text-foreground">{kpi.value || "—"}</p>
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

function InsightRow({
  icon: Icon,
  label,
  badge,
  badgeTone,
  title,
  text,
}: {
  icon: typeof Sparkles;
  label: string;
  badge?: string;
  badgeTone?: "high" | "medium" | "low";
  title: string;
  text?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-(--radius-tile) px-1 py-1.5 transition-colors duration-(--duration-base) hover:bg-secondary/30">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {badge ? <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", priorityStyles[badgeTone ?? "medium"])}>{badge}</span> : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-5 text-foreground">{title}</p>
        {text ? <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-muted-foreground">{text}</p> : null}
      </div>
    </div>
  );
}
