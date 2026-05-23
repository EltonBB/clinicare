"use client";

import { startTransition, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  Inbox,
  Minus,
  RefreshCw,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";

import { refreshAnalyticsInsightsAction } from "@/app/(workspace)/reports/actions";
import { cn } from "@/lib/utils";
import type {
  ReportMetric,
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
  strong: "border-primary/20 bg-white",
  healthy: "border-primary/15 bg-white",
  watch: "border-amber-300/70 bg-white",
  attention: "border-destructive/25 bg-white",
};

const priorityStyles = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-primary/10 text-primary",
  low: "bg-secondary text-muted-foreground",
} as const;

function TrendIcon({ trend }: { trend: ReportMetricTrend }) {
  if (trend === "up") return <ArrowUpRight className="size-3.5" />;
  if (trend === "down") return <ArrowDownRight className="size-3.5" />;
  return <Minus className="size-3.5" />;
}

function buildLinePath(values: number[], width: number, height: number) {
  if (values.length === 0) return "";

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function getMetric(metrics: ReportMetric[], label: string) {
  return metrics.find((metric) => metric.label === label);
}

function metricOrDerived(
  metric: ReportMetric | undefined,
  fallback: Pick<ReportMetric, "label" | "value" | "delta" | "trend" | "helper">
) {
  return metric ?? fallback;
}

function statusColor(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("completed")) return "#0A22FF";
  if (normalized.includes("cancelled")) return "#ef4444";
  if (normalized.includes("pending")) return "#f59e0b";
  if (normalized.includes("confirmed")) return "#5b57d6";
  return "#94a3b8";
}

function buildStatusConic(statusMix: ReportsViewModel["periods"][ReportPeriodKey]["diagnostics"]["statusMix"]) {
  const total = statusMix.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return "conic-gradient(#e5e7eb 0 100%)";
  }

  let cursor = 0;
  const segments = statusMix
    .filter((item) => item.count > 0)
    .map((item) => {
      const start = cursor;
      const end = cursor + (item.count / total) * 100;
      cursor = end;
      return `${statusColor(item.label)} ${start}% ${end}%`;
    });

  return `conic-gradient(${segments.join(", ")})`;
}

export function ReportsOverview({ view }: { view: ReportsViewModel }) {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriodKey>(view.defaultPeriod);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState("");
  const router = useRouter();
  const period = view.periods[selectedPeriod];
  const [fromInput, setFromInput] = useState(period.periodStart.slice(0, 10));
  const [toInput, setToInput] = useState(period.periodEnd.slice(0, 10));
  const chartValues = period.chart.points.map((point) => point.value);
  const linePath = useMemo(() => buildLinePath(chartValues, 620, 190), [chartValues]);
  const completionMetric = getMetric(period.metrics, "Completion rate");
  const completionValue = completionMetric?.value.endsWith("%")
    ? Number(completionMetric.value.replace("%", "")) / 100
    : 0.5;
  const completedLinePath = useMemo(
    () => buildLinePath(chartValues.map((value) => Math.round(value * completionValue)), 620, 190),
    [chartValues, completionValue]
  );
  const topCause = period.snapshot.rootCauses?.[0];
  const primaryAction = period.snapshot.actions?.[0];
  const primaryOpportunity = period.snapshot.opportunities?.[0];
  const busiestDays = period.diagnostics.demandWindows.busiestDays;
  const quietestDays = period.diagnostics.demandWindows.quietestDays.filter((item) => item.count > 0);
  const busiestHours = period.diagnostics.demandWindows.busiestHours;
  const clientTotal =
    period.diagnostics.clientMix.active +
    period.diagnostics.clientMix.atRisk +
    period.diagnostics.clientMix.inactive +
    period.diagnostics.clientMix.archived;
  const completedStatus =
    period.diagnostics.statusMix.find((item) => item.label === "Completed") ??
    period.diagnostics.statusMix[0];
  const statusTotal = period.diagnostics.statusMix.reduce((sum, item) => sum + item.count, 0);
  const clientActiveShare = clientTotal > 0 ? (period.diagnostics.clientMix.active / clientTotal) * 100 : 0;
  const metricCards = [
    { icon: CalendarDays, metric: getMetric(period.metrics, "Appointments") },
    { icon: CheckCircle2, metric: completionMetric },
    { icon: Clock3, metric: getMetric(period.metrics, "Avg visit length") },
    {
      icon: UsersRound,
      metric: metricOrDerived(undefined, {
        label: "Active clients",
        value: period.activeClients.toLocaleString("en-US"),
        delta: `${clientActiveShare.toFixed(0)}% of clients`,
        trend: "flat",
        helper: `${clientTotal.toLocaleString("en-US")} total records`,
      }),
    },
    { icon: Gauge, metric: getMetric(period.metrics, "Schedule utilization") },
    {
      icon: Inbox,
      metric: metricOrDerived(undefined, {
        label: "Unread messages",
        value: period.unreadMessages.toLocaleString("en-US"),
        delta: "current inbox",
        trend: period.unreadMessages > 0 ? "up" : "flat",
        helper: "Open conversations",
      }),
    },
  ].map((item) => ({
    icon: item.icon,
    metric: metricOrDerived(item.metric, {
      label: "Metric",
      value: "-",
      delta: "Not measured",
      trend: "flat",
      helper: period.comparisonLabel,
    }),
  }));

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
    setFromInput(item.periodStart.slice(0, 10));
    setToInput(item.periodEnd.slice(0, 10));
    setRangeError("");
  }

  function applyRange() {
    if (!fromInput || !toInput) return;
    if (toInput < fromInput) {
      setRangeError("End date must be after the start date.");
      return;
    }

    setRangeError("");
    router.push(`/reports?from=${fromInput}&to=${toInput}`);
  }

  return (
    <div className="w-full space-y-3.5">
      <section className="section-reveal space-y-3.5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-foreground">
              Reports
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Track performance, utilization, and opportunities to grow the clinic.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
            <div className="inline-flex rounded-[0.75rem] border border-border/80 bg-white p-1 shadow-[0_12px_28px_rgba(20,21,47,0.04)]">
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
                      "rounded-[0.5rem] px-3.5 py-2 text-sm font-medium transition-colors",
                      selected ? "border border-primary/20 bg-white text-primary shadow-none" : "text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div className="inline-flex flex-col gap-1">
              <div className="inline-grid gap-2 rounded-[0.75rem] border border-border/80 bg-white p-1.5 shadow-[0_12px_28px_rgba(20,21,47,0.04)] sm:grid-cols-[140px_140px_auto]">
                <input
                  type="date"
                  value={fromInput}
                  onChange={(event) => {
                    setFromInput(event.target.value);
                    setRangeError("");
                  }}
                  className="h-8 rounded-[0.55rem] px-2 text-sm outline-none focus:ring-2 focus:ring-primary/15"
                  aria-label="Report start date"
                />
                <input
                  type="date"
                  value={toInput}
                  onChange={(event) => {
                    setToInput(event.target.value);
                    setRangeError("");
                  }}
                  className="h-8 rounded-[0.55rem] px-2 text-sm outline-none focus:ring-2 focus:ring-primary/15"
                  aria-label="Report end date"
                />
                <button
                  type="button"
                  onClick={applyRange}
                  className="h-8 rounded-[0.55rem] px-3 text-sm font-semibold text-primary hover:bg-primary/8"
                >
                  Analyse range
                </button>
              </div>
              {rangeError ? (
                <span className="px-1 text-xs font-medium text-destructive">{rangeError}</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={refreshInsights}
              disabled={isRefreshing}
              className="inline-flex h-10 items-center gap-2 rounded-[0.75rem] border border-border/80 bg-white px-3 text-sm font-medium text-foreground shadow-[0_12px_28px_rgba(20,21,47,0.04)] hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
              Refresh AI analysis
            </button>
          </div>
        </div>

        {refreshMessage ? (
          <div className="rounded-[0.9rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
            {refreshMessage}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {metricCards.map(({ icon: Icon, metric }) => (
            <div key={metric.label} className="surface-card px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <div className="vela-icon-tile size-9 rounded-[0.85rem]">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
                    {metric.value}
                  </p>
                  <p className={cn("mt-1 inline-flex items-center gap-1 text-xs font-medium", metricTone[metric.trend])}>
                    <TrendIcon trend={metric.trend} />
                    {metric.delta}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="grid gap-3.5">
          <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.9fr)_minmax(260px,0.9fr)]">
            <section className="surface-card p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Performance overview</h2>
                  <div className="mt-3 flex flex-wrap gap-5 text-xs font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-0.5 w-4 rounded-full bg-primary" />
                      Appointments
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-0.5 w-4 rounded-full border-t border-dashed border-primary" />
                      Completed appointments
                    </span>
                  </div>
                </div>
                <span className="rounded-[0.55rem] border border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground">
                  {period.comparisonLabel}
                </span>
              </div>

              <svg viewBox="0 0 620 250" className="mt-2 h-[190px] w-full" role="img" aria-label={period.chart.title}>
                {[0, 1, 2, 3].map((line) => (
                  <line
                    key={line}
                    x1="0"
                    x2="620"
                    y1={25 + line * 50}
                    y2={25 + line * 50}
                    stroke="rgba(20,21,47,0.08)"
                    strokeWidth="1"
                  />
                ))}
                <path d={`${linePath} L 620 190 L 0 190 Z`} fill="rgba(10,34,255,0.10)" transform="translate(0 18)" />
                <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 18)" />
                <path d={completedLinePath} fill="none" stroke="var(--primary)" strokeDasharray="7 7" strokeWidth="2" strokeLinecap="round" transform="translate(0 18)" />
                {period.chart.points.map((point, index) => {
                  const max = Math.max(...chartValues, 1);
                  const min = Math.min(...chartValues, 0);
                  const range = Math.max(max - min, 1);
                  const x = (index / Math.max(period.chart.points.length - 1, 1)) * 620;
                  const y = 208 - ((point.value - min) / range) * 190;

                  return (
                    <g key={`${point.label}-${index}`}>
                      <circle cx={x} cy={y} r="4.5" fill="var(--primary)" />
                      <text
                        x={x}
                        y="238"
                        textAnchor={index === 0 ? "start" : index === period.chart.points.length - 1 ? "end" : "middle"}
                        className="fill-muted-foreground text-[11px]"
                      >
                        {point.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="grid border-t border-border/70 pt-2.5 text-sm sm:grid-cols-4">
                <BreakdownCell label="Total appointments" value={getMetric(period.metrics, "Appointments")?.value ?? "-"} />
                <BreakdownCell label="Completed" value={String(completedStatus?.count ?? 0)} />
                <BreakdownCell label="Cancelled" value={String(period.diagnostics.statusMix.find((item) => item.label === "Cancelled")?.count ?? 0)} />
                <BreakdownCell
                  label="Pending"
                  value={String(period.diagnostics.statusMix.find((item) => item.label === "Pending")?.count ?? 0)}
                />
              </div>
            </section>

            <section className="surface-card p-3.5">
              <h2 className="text-base font-semibold text-foreground">Client status mix</h2>
              <div className="mt-4 grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div
                  className="mx-auto grid size-28 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(var(--primary) 0 ${clientActiveShare}%, #f59e0b ${clientActiveShare}% ${clientActiveShare + (clientTotal ? (period.diagnostics.clientMix.atRisk / clientTotal) * 100 : 0)}%, #cbd5e1 0 100%)`,
                  }}
                >
                    <div className="grid size-16 place-items-center rounded-full bg-white text-center shadow-inner">
                    <div>
                      <p className="text-xl font-semibold text-foreground">{clientTotal}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5 text-sm">
                  <LegendRow color="bg-primary" label="Active" value={`${period.diagnostics.clientMix.active} (${clientActiveShare.toFixed(0)}%)`} />
                  <LegendRow color="bg-amber-500" label="At risk" value={String(period.diagnostics.clientMix.atRisk)} />
                  <LegendRow color="bg-slate-300" label="Inactive" value={String(period.diagnostics.clientMix.inactive)} />
                  <LegendRow color="bg-slate-400" label="Archived" value={String(period.diagnostics.clientMix.archived)} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <SimpleMetric label="Total records" value={clientTotal.toString()} />
                <SimpleMetric label="Active share" value={`${clientActiveShare.toFixed(0)}%`} />
              </div>
            </section>
          </div>

          <div className="grid items-start gap-3.5 xl:grid-cols-3">
            <section className="surface-card p-3.5">
              <h2 className="text-base font-semibold text-foreground">Operational metrics</h2>
              <div className="mt-3 space-y-2.5">
                <SimpleMetric label="Repeat-visit rate" value={getMetric(period.metrics, "Repeat-visit rate")?.value ?? "-"} />
                <SimpleMetric label="Lost-slot rate" value={getMetric(period.metrics, "Lost-slot rate")?.value ?? "-"} />
                <SimpleMetric label="Follow-up coverage" value={getMetric(period.metrics, "Follow-up coverage")?.value ?? "-"} />
                <SimpleMetric label="Same-day bookings" value={String(period.diagnostics.bookingBehavior.sameDayBookings)} />
                <SimpleMetric label="Unassigned visits" value={String(period.diagnostics.bookingBehavior.unassignedAppointments)} />
              </div>
            </section>

            <section className="surface-card p-3.5">
              <h2 className="text-base font-semibold text-foreground">Appointment status</h2>
              <div className="mt-4 grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div
                  className="mx-auto grid size-28 place-items-center rounded-full"
                  style={{ background: buildStatusConic(period.diagnostics.statusMix) }}
                >
                  <div className="grid size-16 place-items-center rounded-full bg-white text-center shadow-inner">
                    <div>
                      <p className="text-xl font-semibold text-foreground">{statusTotal}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5 text-sm">
                  {period.diagnostics.statusMix.map((item) => (
                    <LegendRow key={item.label} color={item.label === "Completed" ? "bg-primary" : item.label === "Cancelled" ? "bg-destructive" : item.label === "Pending" ? "bg-amber-500" : "bg-primary/60"} label={item.label} value={`${item.count} (${item.share})`} />
                  ))}
                </div>
              </div>
            </section>

            <section className="surface-card p-3.5">
              <h2 className="text-base font-semibold text-foreground">Detailed breakdown</h2>
              <div className="mt-3 space-y-2.5">
                {period.metrics.slice(0, 6).map((metric) => (
                  <div key={metric.label} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{metric.label}</span>
                    <span className="font-semibold text-foreground">{metric.value}</span>
                    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", metricTone[metric.trend])}>
                      <TrendIcon trend={metric.trend} />
                      {metric.delta}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="surface-card p-3.5">
              <h2 className="text-base font-semibold text-foreground">Demand windows</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <DemandList title="Busiest days" items={busiestDays} />
                <DemandList title="Quietest days" items={quietestDays} />
                <DemandList title="Busiest hours" items={busiestHours} />
              </div>
            </section>

            <section className="rounded-[1rem] border border-border/80 bg-white p-3.5 shadow-[0_12px_28px_rgba(20,32,51,0.035)]">
              <h2 className="text-base font-semibold text-foreground">Staff load</h2>
              <div className="mt-3 space-y-3">
                {period.diagnostics.staffLoad.length > 0 ? (
                  period.diagnostics.staffLoad.slice(0, 4).map((staff) => (
                    <div key={staff.name}>
                      <div className="flex items-start justify-between gap-3 text-sm">
                        <div>
                          <p className="font-semibold text-foreground">{staff.name}</p>
                          <p className="text-muted-foreground">{staff.role}</p>
                        </div>
                        <p className="text-right font-medium text-foreground">
                          {staff.appointments} visit{staff.appointments === 1 ? "" : "s"}
                          <span className="block text-xs font-normal text-muted-foreground">{staff.utilizationShare} of booked time</span>
                        </p>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-secondary">
                        <div className="vela-gradient h-2 rounded-full" style={{ width: staff.utilizationShare }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No active staff load yet.</p>
                )}
              </div>
            </section>
          </div>
        </div>

        <aside className={cn("rounded-[1rem] border p-4 shadow-[0_16px_36px_rgba(20,32,51,0.04)]", snapshotToneStyles[period.snapshot.tone])}>
          <div className="flex items-start justify-between gap-4">
            <h2 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
              <Sparkles className="size-4 text-primary" />
              Vela AI insights
            </h2>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-sm font-semibold text-foreground">
              <Brain className="size-4 text-primary" />
              {period.snapshot.score}/100
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            <InsightCard title="Snapshot" emphasis>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                {period.label} readout
              </h3>
              <p className="mt-3 text-sm font-semibold text-foreground">{period.snapshot.headline}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{period.snapshot.summary}</p>
            </InsightCard>

            {topCause ? (
              <InsightCard title="Diagnosis" badge={`${topCause.severity} severity`}>
                <p className="text-sm font-semibold text-foreground">{topCause.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{topCause.evidence}</p>
              </InsightCard>
            ) : period.snapshot.diagnosis ? (
              <InsightCard title="Diagnosis" badge={period.snapshot.severity ? `${period.snapshot.severity} severity` : undefined}>
                <p className="text-sm leading-6 text-muted-foreground">{period.snapshot.diagnosis}</p>
              </InsightCard>
            ) : null}

            <InsightIconBlock icon={CheckCircle2} title="What is working" text={period.snapshot.strength} />
            <InsightIconBlock icon={AlertTriangle} title="What needs attention" text={period.snapshot.watch} />

            {primaryAction ? (
              <InsightCard title="Next move" badge={`${primaryAction.priority} priority`}>
                <p className="text-sm font-semibold text-foreground">{primaryAction.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{primaryAction.detail}</p>
              </InsightCard>
            ) : (
              <InsightIconBlock icon={Target} title="Next move" text={period.snapshot.focus} />
            )}

            {primaryOpportunity ? (
              <InsightIconBlock icon={Activity} title={primaryOpportunity.title} text={primaryOpportunity.detail} />
            ) : null}

            <div className="pt-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span>{period.snapshot.auditLabel}</span>
                <span>{period.snapshot.generatedAt ?? period.rangeLabel}</span>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function BreakdownCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/70 px-2 py-1.5 first:pl-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
      <span className={cn("size-2.5 rounded-full", color)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function SimpleMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[0.7rem] border border-border/60 bg-white/60 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function DemandList({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-2.5 space-y-2">
        {items.length > 0 ? (
          items.slice(0, 3).map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-semibold text-foreground">{item.count}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No visits yet.</p>
        )}
      </div>
    </div>
  );
}

function InsightCard({
  title,
  badge,
  emphasis,
  children,
}: {
  title: string;
  badge?: string;
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-[0.85rem] border p-3.5", emphasis ? "border-amber-300/70 bg-amber-50/50" : "border-border/80 bg-white")}>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {badge ? (
          <span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", priorityStyles[badge.startsWith("high") ? "high" : badge.startsWith("low") ? "low" : "medium"])}>
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function InsightIconBlock({
  icon: Icon,
  title,
  text,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[0.85rem] border border-border/80 bg-white p-3.5">
      <div className="flex gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{text}</p>
        </div>
      </div>
    </div>
  );
}
