"use client";

import { startTransition, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m } from "framer-motion";
import {
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
} from "date-fns";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  Minus,
  RefreshCw,
  UserPlus,
  UsersRound,
} from "lucide-react";

import { refreshAnalyticsInsightsAction } from "@/app/(workspace)/reports/actions";
import {
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
import { MonthGrid } from "@/components/workspace/month-grid";
import { LazyMotionProvider } from "@/components/layout/motion-provider";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { fadeIn, staggerChildren, staggerItem } from "@/lib/motion";
import type {
  ReportKpi,
  ReportMetricTrend,
  ReportPeriodKey,
  ReportSnapshotTone,
  ReportsViewModel,
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

const priorityStyles = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-primary/10 text-primary",
  low: "bg-secondary text-muted-foreground",
} as const;

const kpiIcons: Record<string, typeof CalendarDays> = {
  appointments: CalendarDays,
  completionRate: CheckCircle2,
  newClients: UserPlus,
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

// Keyed on the status label rather than a stable id on purpose: statusMix lives
// inside `diagnostics`, which is hashed for AI-snapshot freshness, so adding a
// field there would invalidate cached snapshots. The labels are enum-derived and
// stable, so substring matching is safe here.
function statusColor(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("completed")) return "var(--primary)";
  if (normalized.includes("cancelled")) return "#ef4444";
  if (normalized.includes("pending")) return "#f59e0b";
  if (normalized.includes("confirmed")) return "#5b57d6";
  return "#94a3b8";
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

/** Month-grid range picker built on the shared MonthGrid. */
function RangeCalendar({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const fromDate = from ? parseISO(from) : null;
  const toDate = to ? parseISO(to) : null;
  const [monthCursor, setMonthCursor] = useState<Date>(() =>
    startOfMonth(fromDate ?? new Date())
  );

  function handleSelect(day: Date) {
    const key = format(day, "yyyy-MM-dd");

    // No start yet, or a full range already chosen → begin a new range.
    if (!fromDate || (fromDate && toDate)) {
      onChange(key, "");
      return;
    }

    // Start is set, end is open. Clicking before the start re-anchors it.
    if (isBefore(day, fromDate)) {
      onChange(key, from);
    } else {
      onChange(from, key);
    }
  }

  const rangeCaption = fromDate
    ? toDate
      ? `${format(fromDate, "MMM d, yyyy")} — ${format(toDate, "MMM d, yyyy")}`
      : `${format(fromDate, "MMM d, yyyy")} — pick an end date`
    : "Pick a start date";

  return (
    <div>
      <MonthGrid
        monthCursor={monthCursor}
        onMonthChange={setMonthCursor}
        onSelectDay={handleSelect}
        getDayState={(day) => {
          const isEdge =
            (fromDate ? isSameDay(day, fromDate) : false) ||
            (toDate ? isSameDay(day, toDate) : false);

          return {
            isOutsideMonth: !isSameMonth(day, monthCursor),
            isToday: isSameDay(day, new Date()),
            isSelected: isEdge,
            isInRange:
              fromDate && toDate
                ? isWithinInterval(day, { start: fromDate, end: toDate }) && !isEdge
                : false,
          };
        }}
      />
      <p className="mt-3 border-t border-border/70 pt-3 text-center text-xs font-medium text-muted-foreground">
        {rangeCaption}
      </p>
    </div>
  );
}

export function ReportsOverview({ view }: { view: ReportsViewModel }) {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriodKey>(view.defaultPeriod);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const [chartHover, setChartHover] = useState<number | null>(null);
  const [statusHover, setStatusHover] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(820);
  const chartAreaRef = useRef<HTMLDivElement | null>(null);
  const chartGradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const router = useRouter();
  const period = view.periods[selectedPeriod];
  const [fromInput, setFromInput] = useState(period.periodStartKey);
  const [toInput, setToInput] = useState(period.periodEndKey);
  // Memoized on the (stable) period data so hover-driven re-renders reuse the
  // same array references — otherwise fresh arrays defeat the path memos below
  // and re-run buildSmoothPath on every hover tick.
  const chartPoints = period.chart.points;
  const chartCompletedValues = period.chart.completedValues;
  const chartValues = useMemo(
    () => chartPoints.map((point) => point.value),
    [chartPoints]
  );
  const chartLabels = useMemo(
    () => chartPoints.map((point) => point.label),
    [chartPoints]
  );
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
  const yTicks =
    maxChartValue >= 2 ? [maxChartValue, maxChartValue / 2, 0] : [maxChartValue, 0];
  const completionSeries = useMemo(
    () =>
      chartPoints.map((point, index) =>
        point.value > 0
          ? Math.round(((chartCompletedValues[index] ?? 0) / point.value) * 100)
          : 0
      ),
    [chartPoints, chartCompletedValues]
  );
  const kpiByKey = new Map(period.kpis.map((kpi) => [kpi.key, kpi]));
  const appointmentsKpi = kpiByKey.get("appointments");
  const completionKpi = kpiByKey.get("completionRate");
  const newClientsKpi = kpiByKey.get("newClients");
  const avgVisitKpi = kpiByKey.get("avgVisitLength");
  const topCause = period.snapshot.rootCauses?.[0];
  const primaryAction = period.snapshot.actions?.[0];
  const busiestDay = period.diagnostics.demandWindows.busiestDays[0];
  const busiestHour = period.diagnostics.demandWindows.busiestHours[0];
  const topStaff = period.diagnostics.staffLoad[0];
  const utilizationRow = period.operationalDetail.find(
    (row) => row.key === "utilization"
  );
  const statusMix = period.diagnostics.statusMix;
  const hoveredStatus = statusMix.find((item) => item.label === statusHover);

  const customStart = view.periods.custom.periodStartKey;
  const customEnd = view.periods.custom.periodEndKey;

  useEffect(() => {
    if (view.defaultPeriod !== "custom") return;
    setSelectedPeriod("custom");
    setFromInput(customStart);
    setToInput(customEnd);
    setChartHover(null);
    setStatusHover(null);
  }, [view.defaultPeriod, customStart, customEnd]);

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

  const highlights = [
    busiestDay && busiestDay.count > 0
      ? {
          icon: CalendarDays,
          title: "Busiest window",
          detail: `${busiestDay.label} is the busiest day${
            busiestHour && busiestHour.count > 0 ? `, peaking around ${busiestHour.label}` : ""
          }.`,
        }
      : null,
    utilizationRow && utilizationRow.value
      ? {
          icon: Gauge,
          title: "Estimated utilization",
          detail: `${utilizationRow.value} of open capacity is booked (estimate).`,
        }
      : null,
    topStaff
      ? {
          icon: UsersRound,
          title: "Top provider",
          detail: `${topStaff.name} carries the most work with ${topStaff.appointments} ${
            topStaff.appointments === 1 ? "visit" : "visits"
          }.`,
        }
      : null,
    avgVisitKpi && avgVisitKpi.value
      ? {
          icon: Clock3,
          title: "Average visit length",
          detail: `Completed visits average ${avgVisitKpi.value} this period.`,
        }
      : null,
  ].filter((item): item is { icon: typeof CalendarDays; title: string; detail: string } =>
    Boolean(item)
  );

  function refreshInsights() {
    setIsRefreshing(true);
    setRefreshMessage(null);

    startTransition(async () => {
      try {
        const result = await refreshAnalyticsInsightsAction();
        setRefreshMessage(result.message);
        router.refresh();
      } catch {
        setRefreshMessage("Analysis could not refresh right now. Current reports are still using saved metrics.");
      } finally {
        setIsRefreshing(false);
      }
    });
  }

  function selectPeriod(key: ReportPeriodKey) {
    const item = view.periods[key];
    setSelectedPeriod(key);
    setFromInput(item.periodStartKey);
    setToInput(item.periodEndKey);
    setRangeError("");
    setChartHover(null);
    setStatusHover(null);
  }

  function applyRange() {
    if (!fromInput || !toInput) {
      setRangeError("Pick both a start and an end date.");
      return;
    }
    if (toInput < fromInput) {
      setRangeError("End date must be after the start date.");
      return;
    }

    setRangeError("");
    setRangeOpen(false);
    router.push(`/reports?from=${fromInput}&to=${toInput}`);
  }

  return (
    <LazyMotionProvider>
    <div className="-mx-4 -mt-3 px-3 pt-3 pb-28 sm:-mx-5 sm:px-3 lg:-mx-6 lg:-mt-4 lg:-mb-4 lg:px-3 lg:pt-3 lg:pb-3">
    <WorkspacePage>
      <WorkspaceHeader
        title="Reports"
        description="How the clinic is performing and where to focus next."
        actions={
          <>
            <div className="inline-flex h-10 items-center rounded-(--radius-card) border border-border/80 bg-white p-1">
              {view.periodOrder.map((key) => {
                const item = view.periods[key];
                const selected = selectedPeriod === key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectPeriod(item.key)}
                    className={cn(
                      "rounded-[0.45rem] px-3 py-1.5 text-sm font-medium transition-[background-color,color,transform] duration-(--duration-base) ease-(--ease-out-quint) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.97]",
                      selected
                        ? "bg-primary/8 text-primary"
                        : "text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-label="Choose a custom date range"
              aria-haspopup="dialog"
              aria-expanded={rangeOpen}
              onClick={() => setRangeOpen(true)}
              className={cn(
                "grid size-10 place-items-center rounded-(--radius-card) border bg-white transition-[background-color,border-color,color,transform] duration-(--duration-base) ease-(--ease-out-quint) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.97]",
                rangeOpen || selectedPeriod === "custom"
                  ? "border-primary/40 text-primary"
                  : "border-border/80 text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              <CalendarDays className="size-4" />
            </button>
            <Dialog open={rangeOpen} onOpenChange={setRangeOpen}>
              <DialogContent className="gap-0 p-0 sm:max-w-[420px]">
                <DialogHeader className="px-5 pt-5">
                  <DialogTitle>Custom range</DialogTitle>
                  <DialogDescription>
                    Pick a start and end date to analyse.
                  </DialogDescription>
                </DialogHeader>
                <div className="px-5 py-4">
                  <RangeCalendar
                    from={fromInput}
                    to={toInput}
                    onChange={(nextFrom, nextTo) => {
                      setFromInput(nextFrom);
                      setToInput(nextTo);
                      setRangeError("");
                    }}
                  />
                  {rangeError ? (
                    <p className="mt-2 text-center text-xs font-medium text-destructive">
                      {rangeError}
                    </p>
                  ) : null}
                </div>
                <DialogFooter>
                  <DialogClose className="inline-flex h-9 items-center justify-center rounded-(--radius-card) border border-border/75 bg-white px-3.5 text-sm font-semibold text-foreground transition-[background-color,border-color] duration-(--duration-base) hover:border-border hover:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45">
                    Cancel
                  </DialogClose>
                  <button
                    type="button"
                    onClick={applyRange}
                    disabled={!fromInput || !toInput}
                    className={cn(
                      buttonVariants({ variant: "solid" }),
                      "rounded-(--radius-card) px-3.5"
                    )}
                  >
                    Analyse range
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <button
              type="button"
              onClick={refreshInsights}
              disabled={isRefreshing}
              className="inline-flex h-10 items-center gap-2 rounded-(--radius-card) border border-border/80 bg-white px-3 text-sm font-medium text-foreground transition-[background-color,border-color,color,transform] duration-(--duration-base) ease-(--ease-out-quint) hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
            >
              <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
              Refresh AI
            </button>
          </>
        }
      />

      {refreshMessage ? (
        <div className="rounded-(--radius-card) border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
          {refreshMessage}
        </div>
      ) : null}

      <m.div
        key={selectedPeriod}
        variants={fadeIn}
        initial="initial"
        animate="animate"
        className="space-y-3"
      >
        <m.div
          variants={staggerChildren}
          initial="initial"
          animate="animate"
          className="grid gap-3 md:grid-cols-3"
        >
          {appointmentsKpi ? (
            <KpiCard
              kpi={appointmentsKpi}
              series={chartValues}
              labels={chartLabels}
              chartType="bars"
            />
          ) : null}
          {completionKpi ? (
            <KpiCard
              kpi={completionKpi}
              series={completionSeries}
              labels={chartLabels}
              chartType="line"
              formatValue={(value) => `${value}%`}
            />
          ) : null}
          {newClientsKpi ? (
            <KpiCard
              kpi={newClientsKpi}
              series={period.chart.newClientValues}
              labels={chartLabels}
              chartType="bars"
            />
          ) : null}
        </m.div>

        <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
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
                          <line
                            x1={PLOT_LEFT}
                            x2={chartWidth}
                            y1={y}
                            y2={y}
                            stroke="rgba(20,21,47,0.06)"
                            strokeWidth="1"
                          />
                          <text
                            x={PLOT_LEFT - 8}
                            y={y + 3}
                            textAnchor="end"
                            className="fill-muted-foreground text-[10px]"
                          >
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
                      const x =
                        PLOT_LEFT +
                        (index / Math.max(period.chart.points.length - 1, 1)) * plotWidth;
                      const y = PLOT_BOTTOM - (point.value / maxChartValue) * PLOT_HEIGHT;
                      const completedY =
                        PLOT_BOTTOM -
                        ((period.chart.completedValues[index] ?? 0) / maxChartValue) * PLOT_HEIGHT;
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
                              <circle
                                cx={x}
                                cy={completedY}
                                r={3.5}
                                fill="var(--primary)"
                                fillOpacity="0.55"
                                stroke="white"
                                strokeWidth="1.5"
                              />
                              <circle
                                cx={x}
                                cy={y}
                                r={5}
                                fill="var(--primary)"
                                stroke="white"
                                strokeWidth="2"
                              />
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
                    style={{
                      left: PLOT_LEFT,
                      gridTemplateColumns: `repeat(${period.chart.points.length}, 1fr)`,
                    }}
                  >
                    {period.chart.points.map((_, index) => (
                      <div key={index} onMouseEnter={() => setChartHover(index)} />
                    ))}
                  </div>

                  {chartHover !== null && period.chart.points[chartHover] ? (
                    <div
                      className={cn(
                        "pointer-events-none absolute top-0 z-10 rounded-(--radius-tile) border border-border/80 bg-white px-2.5 py-1.5 shadow-[0_8px_20px_rgba(20,21,47,0.1)]",
                        chartHover === 0
                          ? ""
                          : chartHover === period.chart.points.length - 1
                            ? "-translate-x-full"
                            : "-translate-x-1/2"
                      )}
                      style={{
                        left:
                          PLOT_LEFT +
                          (chartHover / Math.max(period.chart.points.length - 1, 1)) * plotWidth,
                      }}
                    >
                      <p className="text-xs font-semibold text-foreground">
                        {period.chart.points[chartHover].label}
                      </p>
                      <p className="mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
                        {period.chart.points[chartHover].value}{" "}
                        {period.chart.points[chartHover].value === 1 ? "appointment" : "appointments"}
                        <span className="mx-1">·</span>
                        {period.chart.completedValues[chartHover] ?? 0} completed
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
                  period.snapshot.status === "generated"
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                {period.snapshot.statusLabel}
              </span>
            </div>

            <div className="mt-0.5 flex-1 divide-y divide-border/65">
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

            <div className="mt-1.5 flex items-center justify-center gap-2 rounded-(--radius-tile) border border-border/70 bg-secondary/35 px-3 py-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: snapshotToneColor[period.snapshot.tone] }}
              />
              <p className="text-xs font-medium text-muted-foreground">
                Operational health score:{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {period.snapshot.score}/100
                </span>
              </p>
            </div>
          </section>
        </div>

        <div className="grid items-stretch gap-3 xl:grid-cols-2">
          <section className="flex flex-col rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-card)">
            <h2 className="px-1 text-[15px] font-semibold text-foreground">Appointment status</h2>
            {period.statusTotal > 0 ? (
              <div className="grid flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-8 px-2 py-2">
                <div className="relative" onMouseLeave={() => setStatusHover(null)}>
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
                <div className="divide-y divide-border/65 text-sm" onMouseLeave={() => setStatusHover(null)}>
                  {statusMix.map((item) => (
                    <LegendRow
                      key={item.label}
                      color={statusColor(item.label)}
                      label={item.label}
                      value={`${item.count}`}
                      detail={item.share.replace(/\.0%$/, "%")}
                      muted={item.count === 0}
                      active={statusHover === item.label}
                      onHover={() => setStatusHover(item.label)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <WorkspaceEmptyState
                  compact
                  icon={CheckCircle2}
                  title="No status mix yet"
                  description="Statuses appear after visits are booked."
                />
              </div>
            )}
          </section>

          <section className="flex flex-col rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-card)">
            <h2 className="px-1 text-[15px] font-semibold text-foreground">Highlights</h2>
            {highlights.length > 0 ? (
              <div className="mt-2.5 flex flex-1 flex-col justify-center space-y-1.5">
                {highlights.slice(0, 4).map((highlight) => (
                  <div
                    key={highlight.title}
                    className="flex items-center gap-3 rounded-(--radius-tile) border border-border/70 px-3 py-1"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
                      <highlight.icon className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{highlight.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{highlight.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <WorkspaceEmptyState
                  compact
                  icon={CalendarDays}
                  title="No activity pattern yet"
                  description="Highlights appear once appointments are booked."
                />
              </div>
            )}
          </section>
        </div>
      </m.div>
    </WorkspacePage>
    </div>
    </LazyMotionProvider>
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
  const size = 128;
  const strokeWidth = 14;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2 - 2;
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const nonZero = items.filter((item) => item.count > 0);
  // butt linecaps need only a tiny angular gap — no overlap possible
  const pad = nonZero.length > 1 ? 0.055 : 0;

  let cursor = -Math.PI / 2;
  const arcs = nonZero.map((item) => {
    const sweep = (item.count / total) * Math.PI * 2;
    const a0 = cursor + pad;
    const a1 = Math.max(cursor + sweep - pad, a0 + 0.01);
    cursor += sweep;
    const [x0, y0] = polarPoint(center, center, radius, a0);
    const [x1, y1] = polarPoint(center, center, radius, a1);
    const largeArc = a1 - a0 > Math.PI ? 1 : 0;

    return {
      item,
      d: `M ${round2(x0)} ${round2(y0)} A ${radius} ${radius} 0 ${largeArc} 1 ${round2(x1)} ${round2(y1)}`,
    };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="size-32">
      {nonZero.length === 1 ? (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={statusColor(nonZero[0].label)}
          strokeWidth={hovered === nonZero[0].label ? strokeWidth + 3 : strokeWidth}
          opacity={hovered && hovered !== nonZero[0].label ? 0.25 : 1}
          className="transition-[stroke-width,opacity] duration-(--duration-base)"
          onMouseEnter={() => onHover(nonZero[0].label)}
        />
      ) : (
        arcs.map(({ item, d }) => (
          <path
            key={item.label}
            d={d}
            fill="none"
            stroke={statusColor(item.label)}
            strokeWidth={hovered === item.label ? strokeWidth + 3 : strokeWidth}
            strokeLinecap="butt"
            opacity={hovered && hovered !== item.label ? 0.25 : 1}
            className="transition-[stroke-width,opacity] duration-(--duration-base)"
            onMouseEnter={() => onHover(item.label)}
          />
        ))
      )}
    </svg>
  );
}

function MiniChartTooltip({
  index,
  count,
  label,
  value,
}: {
  index: number;
  count: number;
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 whitespace-nowrap rounded-(--radius-tile) border border-border/80 bg-white px-2 py-1 text-[11px] font-medium text-foreground shadow-[0_6px_16px_rgba(20,21,47,0.12)]",
        index === 0 ? "" : index === count - 1 ? "-translate-x-full" : "-translate-x-1/2"
      )}
      style={{
        left: `${(index / Math.max(count - 1, 1)) * 100}%`,
        bottom: "calc(100% + 6px)",
      }}
    >
      {label} · {value}
    </div>
  );
}

function MiniBars({
  values,
  labels,
  formatValue,
}: {
  values: number[];
  labels: string[];
  formatValue: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...values, 1);

  return (
    <div className="relative h-full w-full" onMouseLeave={() => setHover(null)}>
      <div className="flex h-full w-full items-end gap-1.5">
        {values.map((value, index) => (
          <div
            key={index}
            className="relative flex h-full flex-1 items-end overflow-hidden rounded-[4px] bg-secondary/70"
            onMouseEnter={() => setHover(index)}
          >
            <div
              className={cn(
                "w-full rounded-[4px] transition-colors duration-(--duration-base)",
                index === values.length - 1
                  ? "bg-primary"
                  : hover === index
                    ? "bg-primary/70"
                    : "bg-primary/40"
              )}
              style={{ height: `${(value / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      {hover !== null ? (
        <MiniChartTooltip
          index={hover}
          count={values.length}
          label={labels[hover] ?? ""}
          value={formatValue(values[hover] ?? 0)}
        />
      ) : null}
    </div>
  );
}

function MiniLine({
  values,
  labels,
  formatValue,
}: {
  values: number[];
  labels: string[];
  formatValue: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const max = Math.max(...values, 1);
  const path = buildSmoothPath(values, 100, 30);
  const pointTopPercent = (value: number) => ((5 + 30 - (value / max) * 30) / 40) * 100;
  const lastIndex = values.length - 1;

  return (
    <div className="relative h-full w-full" onMouseLeave={() => setHover(null)}>
      <svg viewBox="0 0 100 40" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={`${path} L 100 30 L 0 30 Z`} fill={`url(#${gradientId})`} transform="translate(0 5)" />
        <path
          d={path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          transform="translate(0 5)"
        />
      </svg>
      {hover === null ? (
        <span
          className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-white"
          style={{ left: "100%", top: `${pointTopPercent(values[lastIndex] ?? 0)}%` }}
        />
      ) : (
        <>
          <span
            className="pointer-events-none absolute z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-white"
            style={{
              left: `${(hover / Math.max(values.length - 1, 1)) * 100}%`,
              top: `${pointTopPercent(values[hover] ?? 0)}%`,
            }}
          />
          <MiniChartTooltip
            index={hover}
            count={values.length}
            label={labels[hover] ?? ""}
            value={formatValue(values[hover] ?? 0)}
          />
        </>
      )}
      <div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(${values.length}, 1fr)` }}
      >
        {values.map((_, index) => (
          <div key={index} onMouseEnter={() => setHover(index)} />
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  kpi,
  series,
  labels,
  chartType,
  formatValue = (value) => `${value}`,
}: {
  kpi: ReportKpi;
  series: number[];
  labels: string[];
  chartType: "bars" | "line";
  formatValue?: (value: number) => string;
}) {
  const Icon = kpiIcons[kpi.key] ?? CalendarDays;
  const hasSeries = series.some((value) => value > 0);

  return (
    <m.section
      variants={staggerItem}
      className="card-hover flex items-stretch rounded-(--radius-card) border border-border/80 bg-white shadow-(--shadow-card)"
    >
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
            <Icon className="size-4" />
          </span>
          <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
        </div>
        <div className="mt-auto pt-2.5">
          <p className="text-[1.6rem] font-semibold leading-8 tracking-tight text-foreground">
            {/* The lib returns "" for an unmeasured rate (no finalized visits); show a
                neutral em dash, not a bare "0" that reads as a real 0% rate. */}
            {kpi.value || "—"}
          </p>
          <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap">
            {kpi.delta ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                  deltaPillStyles[kpi.trend]
                )}
              >
                <TrendIcon trend={kpi.trend} />
                {kpi.delta}
              </span>
            ) : null}
            {kpi.helper ? (
              <span className="text-xs text-muted-foreground">{kpi.helper}</span>
            ) : null}
          </div>
        </div>
      </div>
      {hasSeries ? (
        <div className="relative flex w-[52%] items-center px-4">
          <div className="h-[68px] w-full">
            {chartType === "bars" ? (
              <MiniBars values={series} labels={labels} formatValue={formatValue} />
            ) : (
              <MiniLine values={series} labels={labels} formatValue={formatValue} />
            )}
          </div>
        </div>
      ) : null}
    </m.section>
  );
}

function LegendRow({
  color,
  label,
  value,
  detail,
  muted,
  active,
  onHover,
}: {
  color: string;
  label: string;
  value: string;
  detail?: string;
  muted?: boolean;
  active?: boolean;
  onHover?: () => void;
}) {
  return (
    <div
      onMouseEnter={onHover}
      className={cn(
        "flex items-center justify-between gap-2.5 px-1.5 py-1.5 transition-colors duration-(--duration-base)",
        active ? "bg-secondary/55" : "hover:bg-secondary/45"
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn("size-2.5 shrink-0 rounded-full", muted && "opacity-35")}
          style={{ background: color }}
        />
        <span className={cn("truncate", muted ? "text-muted-foreground/60" : "text-muted-foreground")}>
          {label}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 font-medium tabular-nums",
          muted ? "text-muted-foreground/60" : "text-foreground"
        )}
      >
        {value}
        {detail ? (
          <span className={cn("ml-1.5 font-normal", muted ? "text-muted-foreground/50" : "text-muted-foreground")}>
            · {detail}
          </span>
        ) : null}
      </span>
    </div>
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
    <div className="-mx-1 rounded-(--radius-tile) px-2 py-1.5 transition-colors duration-(--duration-base) hover:bg-secondary/30">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {badge ? (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              priorityStyles[badgeTone ?? "medium"]
            )}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-foreground">{title}</p>
      {text ? <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-muted-foreground">{text}</p> : null}
    </div>
  );
}
