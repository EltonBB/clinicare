"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gauge,
  Inbox,
  Minus,
  RefreshCw,
  UsersRound,
} from "lucide-react";

import { refreshAnalyticsInsightsAction } from "@/app/(workspace)/reports/actions";
import {
  WorkspaceHeader,
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspaceKpiCard,
  WorkspaceKpiGrid,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
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
  const appointmentMetric = getMetric(period.metrics, "Appointments");
  const appointmentCount = Number(appointmentMetric?.value.replace(/,/g, "") ?? 0);
  const hasChartData = appointmentCount > 0;
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
  const hasStatusData = statusTotal > 0;
  const clientActiveShare = clientTotal > 0 ? (period.diagnostics.clientMix.active / clientTotal) * 100 : 0;
  const metricCards = [
    { icon: CalendarDays, metric: appointmentMetric },
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
    <WorkspacePage>
      <WorkspaceHeader
        title="Reports"
        description="Track performance, utilization, and opportunities to grow the clinic."
        actions={
          <>
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
          </>
        }
      />

        {refreshMessage ? (
          <div className="rounded-[0.9rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
            {refreshMessage}
          </div>
        ) : null}

        <WorkspaceKpiGrid className="xl:grid-cols-6">
          {metricCards.map(({ icon: Icon, metric }) => (
            <WorkspaceKpiCard
              key={metric.label}
              icon={Icon}
              label={metric.label}
              value={metric.value}
              tone={metric.trend === "down" ? "danger" : metric.trend === "up" ? "good" : "default"}
              helper={
                <span className={cn("inline-flex items-center gap-1", metricTone[metric.trend])}>
                  <TrendIcon trend={metric.trend} />
                  {metric.delta}
                </span>
              }
              compact
            />
          ))}
        </WorkspaceKpiGrid>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.62fr)]">
        <WorkspaceCard compact title="Performance overview" action={<span className="rounded-[0.45rem] border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-muted-foreground">{period.comparisonLabel}</span>}>
          <div className={cn("grid", hasChartData ? "min-h-[210px] grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[auto_auto_auto]")}>
            <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-4 rounded-full bg-primary" />
                Appointments
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-0.5 w-4 rounded-full border-t border-dashed border-primary" />
                Completed appointments
              </span>
            </div>
            {hasChartData ? (
              <svg viewBox="0 0 620 250" className="mt-1 h-[144px] w-full" role="img" aria-label={period.chart.title}>
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
            ) : (
              <div className="mt-3 grid place-items-center rounded-[0.7rem] border border-dashed border-border/80 bg-[#fbfcfe] px-4 py-4 text-center">
                <div>
                  <p className="text-sm font-semibold text-foreground">No appointment trend yet</p>
                  <p className="mt-1 max-w-lg text-sm leading-5 text-muted-foreground">
                    There are no booked appointments in this period, so trend lines are hidden.
                  </p>
                </div>
              </div>
            )}
            <div className="grid border-t border-border/70 pt-2.5 text-sm sm:grid-cols-4">
              <BreakdownCell label="Total appointments" value={getMetric(period.metrics, "Appointments")?.value ?? "-"} />
              <BreakdownCell label="Completed" value={String(completedStatus?.count ?? 0)} />
              <BreakdownCell label="Cancelled" value={String(period.diagnostics.statusMix.find((item) => item.label === "Cancelled")?.count ?? 0)} />
              <BreakdownCell
                label="Pending"
                value={String(period.diagnostics.statusMix.find((item) => item.label === "Pending")?.count ?? 0)}
              />
            </div>
          </div>
        </WorkspaceCard>

        <WorkspaceCard compact title="Client mix" className="self-start">
          {clientTotal > 0 ? (
            <div className="grid content-start gap-3">
              <div className="grid items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div
                  className="mx-auto grid size-24 place-items-center rounded-full"
                  style={{
                    background: `conic-gradient(var(--primary) 0 ${clientActiveShare}%, #f59e0b ${clientActiveShare}% ${clientActiveShare + (clientTotal ? (period.diagnostics.clientMix.atRisk / clientTotal) * 100 : 0)}%, #cbd5e1 0 100%)`,
                  }}
                >
                  <div className="grid size-14 place-items-center rounded-full bg-white text-center shadow-inner">
                    <div>
                      <p className="text-xl font-semibold text-foreground">{clientTotal}</p>
                      <p className="text-[10px] text-muted-foreground">records</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <LegendRow color="bg-primary" label="Active" value={`${period.diagnostics.clientMix.active} (${clientActiveShare.toFixed(0)}%)`} />
                  <LegendRow color="bg-amber-500" label="At risk" value={String(period.diagnostics.clientMix.atRisk)} />
                  <LegendRow color="bg-slate-300" label="Inactive" value={String(period.diagnostics.clientMix.inactive)} />
                  <LegendRow color="bg-slate-400" label="Archived" value={String(period.diagnostics.clientMix.archived)} />
                </div>
              </div>
            </div>
          ) : (
            <WorkspaceEmptyState compact icon={UsersRound} title="No client mix yet" description="Client status mix appears after client records are created." />
          )}
        </WorkspaceCard>
      </div>

      <WorkspaceCard compact title="AI readout" className={cn("border", snapshotToneStyles[period.snapshot.tone])}>
        <div className="grid gap-3 xl:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)_200px] xl:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{period.label}</p>
            <p className="mt-1 text-2xl font-semibold text-primary">{period.snapshot.score}/100</p>
            <p className="mt-1 text-xs text-muted-foreground">{period.snapshot.auditLabel}</p>
          </div>
          <div>
            <p className="line-clamp-2 text-sm font-semibold text-foreground">{period.snapshot.headline}</p>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{period.snapshot.summary}</p>
          </div>
          {topCause ? (
            <CompactInsight label="Diagnosis" badge={`${topCause.severity} severity`} title={topCause.title} text={topCause.evidence} />
          ) : period.snapshot.diagnosis ? (
            <CompactInsight label="Diagnosis" badge={period.snapshot.severity ? `${period.snapshot.severity} severity` : undefined} title={period.snapshot.diagnosis} />
          ) : (
            <CompactInsight label="Diagnosis" title="No diagnosis recorded yet" />
          )}
          {primaryAction ? (
            <CompactInsight label="Next move" badge={`${primaryAction.priority} priority`} title={primaryAction.title} text={primaryAction.detail} />
          ) : (
            <CompactInsight label="Next move" title={period.snapshot.focus} />
          )}
        </div>
      </WorkspaceCard>

      <div className="grid items-start gap-3 xl:grid-cols-3">

        <WorkspaceCard compact title="Operational metrics" className="self-start">
          <div className="space-y-2">
            <SimpleMetric label="Repeat-visit rate" value={getMetric(period.metrics, "Repeat-visit rate")?.value ?? "-"} />
            <SimpleMetric label="Lost-slot rate" value={getMetric(period.metrics, "Lost-slot rate")?.value ?? "-"} />
            <SimpleMetric label="Follow-up coverage" value={getMetric(period.metrics, "Follow-up coverage")?.value ?? "-"} />
            <SimpleMetric label="Same-day bookings" value={String(period.diagnostics.bookingBehavior.sameDayBookings)} />
          </div>
        </WorkspaceCard>

        <WorkspaceCard compact title="Appointment status" className="self-start">
          {hasStatusData ? (
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <div
                className="grid size-20 place-items-center rounded-full"
                style={{ background: buildStatusConic(period.diagnostics.statusMix) }}
              >
                <div className="grid size-12 place-items-center rounded-full bg-white text-center shadow-inner">
                  <p className="text-lg font-semibold text-foreground">{statusTotal}</p>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                {period.diagnostics.statusMix.map((item) => (
                  <LegendRow key={item.label} color={item.label === "Completed" ? "bg-primary" : item.label === "Cancelled" ? "bg-destructive" : item.label === "Pending" ? "bg-amber-500" : "bg-primary/60"} label={item.label} value={`${item.count} (${item.share})`} />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[0.7rem] border border-dashed border-border/80 bg-[#fbfcfe] px-3.5 py-3 text-center">
              <p className="text-sm font-semibold text-foreground">No status mix yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Statuses appear after visits are booked.</p>
            </div>
          )}
        </WorkspaceCard>

        <WorkspaceCard compact title="Breakdown" className="self-start">
          <div className="space-y-2">
            {period.metrics.slice(0, 5).map((metric) => (
              <div key={metric.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm">
                <span className="truncate text-muted-foreground">{metric.label}</span>
                <span className="font-semibold text-foreground">{metric.value}</span>
              </div>
            ))}
          </div>
        </WorkspaceCard>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-2">
        <WorkspaceCard compact title="Demand windows" className="self-start">
          <div className="grid gap-2 sm:grid-cols-3">
            <DemandList title="Busiest days" items={busiestDays} />
            <DemandList title="Quietest days" items={quietestDays} />
            <DemandList title="Busiest hours" items={busiestHours} />
          </div>
        </WorkspaceCard>

        <WorkspaceCard compact title="Staff load" className="self-start">
          <div className="grid gap-2 sm:grid-cols-2">
            {period.diagnostics.staffLoad.length > 0 ? (
              period.diagnostics.staffLoad.slice(0, 4).map((staff) => (
                <div key={staff.name} className="rounded-[0.7rem] border border-border/65 bg-white/65 p-3">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-semibold text-foreground">{staff.name}</p>
                      <p className="text-muted-foreground">{staff.role}</p>
                    </div>
                    <p className="text-right font-medium text-foreground">
                      {staff.appointments}
                      <span className="block text-xs font-normal text-muted-foreground">visits</span>
                    </p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-secondary">
                    <div className="vela-gradient h-2 rounded-full" style={{ width: staff.utilizationShare }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{staff.utilizationShare} of booked time</p>
                </div>
              ))
            ) : (
              <div className="rounded-[0.7rem] border border-dashed border-border/80 bg-[#fbfcfe] px-3.5 py-3 text-center sm:col-span-2">
                <p className="text-sm font-semibold text-foreground">No active staff load</p>
                <p className="mt-1 text-sm text-muted-foreground">Staff utilization appears once appointments are assigned.</p>
              </div>
            )}
          </div>
        </WorkspaceCard>
      </div>
    </WorkspacePage>
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
    <div className="rounded-[0.7rem] border border-border/60 bg-white/60 px-3 py-2">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-2 space-y-1.5">
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

function CompactInsight({
  label,
  badge,
  title,
  text,
}: {
  label: string;
  badge?: string;
  title: string;
  text?: string;
}) {
  return (
    <div className="rounded-[0.7rem] border border-border/75 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        {badge ? (
          <span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", priorityStyles[badge.startsWith("high") ? "high" : badge.startsWith("low") ? "low" : "medium"])}>
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-5 text-foreground">{title}</p>
      {text ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{text}</p> : null}
    </div>
  );
}
