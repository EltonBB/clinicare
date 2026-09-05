import {
  differenceInMinutes,
  isWithinInterval,
} from "date-fns";
import type {
  Appointment,
  Business,
  BusinessHours,
  Client,
  Conversation,
  Message,
  ScheduleBlock,
  StaffMember,
} from "@prisma/client";
import {
  addZonedDays,
  formatZonedDayName,
  formatZonedMonthName,
  formatZonedDateKey,
  formatZonedMonthYear,
  formatZonedShortDate,
  getAppTimeZone,
  getZonedDateParts,
  getZonedDayWindowByOffset,
  getZonedDayWindowFromParts,
  getZonedMonthWindow,
  getZonedWeekWindow,
} from "@/lib/time-zone";
import { sumMergedIntervals } from "@/lib/utils";

export type ReportMetricTrend = "up" | "down" | "flat";
export type ReportSnapshotTone = "strong" | "healthy" | "watch" | "attention";
export type ReportPeriodKey = "daily" | "weekly" | "monthly" | "custom";
export type ReportInsightSource = "ai" | "rules";
export type ReportInsightStatus = "generated" | "fallback" | "errored" | "rules";

export type ReportMetric = {
  label: string;
  value: string;
  delta: string;
  trend: ReportMetricTrend;
  helper: string;
};

export type ReportKpi = {
  key:
    | "appointments"
    | "completionRate"
    | "newClients"
    | "avgVisitLength"
    | "activeClients"
    | "unreadMessages";
  label: string;
  value: string;
  delta: string;
  trend: ReportMetricTrend;
  helper: string;
};

export type ReportDetailRowKey =
  | "utilization"
  | "lostSlot"
  | "repeatVisit"
  | "followUp"
  | "sameDayBookings"
  | "leadTime"
  | "unassigned";

export type ReportDetailRow = {
  /** Stable identifier — match on this, never on the display label. */
  key: ReportDetailRowKey;
  label: string;
  value: string;
  delta: string;
  trend: ReportMetricTrend;
  helper: string;
};

export type ReportClientMixSegment = {
  key: "active" | "atRisk" | "inactive" | "archived";
  label: string;
  count: number;
  percent: number;
};

// NOTE: ReportChartPoint is serialized verbatim into AI snapshot payloads and
// compared by the snapshot freshness check — never add fields here. New chart
// data belongs in parallel fields on the chart object (e.g. completedValues).
export type ReportChartPoint = {
  label: string;
  value: number;
};

export type ReportSnapshot = {
  score: number;
  tone: ReportSnapshotTone;
  headline: string;
  summary: string;
  diagnosis?: string;
  severity?: "high" | "medium" | "low";
  confidence?: "high" | "medium" | "low";
  strength: string;
  watch: string;
  focus: string;
  deepDive?: string;
  rootCauses?: Array<{
    title: string;
    evidence: string;
    severity: "high" | "medium" | "low";
  }>;
  statHighlights?: Array<{
    label: string;
    value: string;
    readout: string;
  }>;
  opportunities?: Array<{
    title: string;
    detail: string;
    impact: "high" | "medium" | "low";
  }>;
  recommendedPlaybook?: {
    name: string;
    why: string;
    steps: string[];
  };
  whatToMonitor?: Array<{
    metric: string;
    target: string;
  }>;
  source: ReportInsightSource;
  status: ReportInsightStatus;
  statusLabel: string;
  auditLabel: string;
  unavailableReason?: string;
  generatedAt?: string;
  model?: string;
  actions?: Array<{
    title: string;
    detail: string;
    priority: "high" | "medium" | "low";
    metric?: string;
    expectedImpact?: string;
  }>;
};

export type ReportPeriodView = {
  key: ReportPeriodKey;
  label: string;
  rangeLabel: string;
  periodStart: string;
  periodEnd: string;
  /** Calendar dates of the period bounds in the app time zone (yyyy-MM-dd). */
  periodStartKey: string;
  periodEndKey: string;
  comparisonLabel: string;
  highlightValue: string;
  highlightChange: string;
  highlightTrend: ReportMetricTrend;
  highlightSummary: string;
  unreadMessages: number;
  activeClients: number;
  metrics: ReportMetric[];
  kpis: ReportKpi[];
  operationalDetail: ReportDetailRow[];
  statusTotal: number;
  clientMixTotal: number;
  clientMixSegments: ReportClientMixSegment[];
  diagnostics: ReportPeriodDiagnostics;
  chart: {
    title: string;
    periodLabel: string;
    points: ReportChartPoint[];
    completedValues: number[];
    newClientValues: number[];
    hasData: boolean;
  };
  snapshot: ReportSnapshot;
};

export type ReportsViewModel = {
  heading: string;
  description: string;
  defaultPeriod: ReportPeriodKey;
  periodOrder: ReportPeriodKey[];
  periods: Record<ReportPeriodKey, ReportPeriodView>;
};

type ReportAppointment = Pick<
  Appointment,
  "status" | "startAt" | "endAt" | "createdAt" | "clientId" | "staffMemberId"
>;

type ReportsWorkspaceArgs = {
  business: Pick<Business, "name">;
  appointments: ReportAppointment[];
  // Clients created within the report window (for "new clients" counts). Whole-
  // base composition arrives precomputed as `clientMix`.
  clients: Array<Pick<Client, "createdAt" | "isArchived">>;
  clientMix: ReportClientMix;
  messages: Array<Pick<Message, "direction" | "sentAt">>;
  businessHours: Array<Pick<BusinessHours, "weekday" | "isOpen" | "startTime" | "endTime">>;
  scheduleBlocks: Array<Pick<ScheduleBlock, "startsAt" | "endsAt">>;
  staffMembers: Array<Pick<StaffMember, "id" | "name" | "role" | "status" | "isActive">>;
  conversations: Array<Pick<Conversation, "unreadCount">>;
  aiSnapshots?: ReportAiSnapshotInput[];
  customRange?: { start: Date; end: Date };
  now?: Date;
  timeZone?: string;
};

export type ReportAiSnapshotInput = {
  periodType: "DAILY" | "WEEKLY" | "MONTHLY";
  periodStart: Date;
  periodEnd: Date;
  kpiPayload: unknown;
  aiPayload: unknown;
  provider: string;
  model: string | null;
  status: "GENERATED" | "FALLBACK" | "ERRORED";
  error?: string | null;
  generatedAt: Date;
};

type PeriodWindow = {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
};

type PeriodStats = {
  scheduledCount: number;
  finalizedCount: number;
  completedCount: number;
  cancelledCount: number;
  bookedMinutes: number;
  completionRate: number;
  lostSlotRate: number;
  utilizationRate: number;
  capacityMinutes: number;
  newClients: number;
  repeatVisitRate: number;
  outboundMessages: number;
  inboundMessages: number;
  followUpRate: number;
  averageVisitLength: number;
  unreadMessages: number;
};

export type ReportClientMix = {
  active: number;
  atRisk: number;
  inactive: number;
  archived: number;
};

export type ReportPeriodDiagnostics = {
  statusMix: Array<{
    label: string;
    count: number;
    share: string;
  }>;
  demandWindows: {
    busiestDays: Array<{ label: string; count: number }>;
    quietestDays: Array<{ label: string; count: number }>;
    busiestHours: Array<{ label: string; count: number }>;
  };
  staffLoad: Array<{
    name: string;
    role: string;
    appointments: number;
    bookedMinutes: number;
    utilizationShare: string;
  }>;
  bookingBehavior: {
    averageLeadTimeHours: number;
    sameDayBookings: number;
    unassignedAppointments: number;
  };
  clientMix: ReportClientMix;
  evidenceSummary: string;
};

const periodOrder: ReportPeriodKey[] = ["daily", "weekly", "monthly"];

function periodKeyToSnapshotType(period: ReportPeriodKey): ReportAiSnapshotInput["periodType"] | null {
  if (period === "daily") return "DAILY";
  if (period === "weekly") return "WEEKLY";
  if (period === "custom") return null;
  return "MONTHLY";
}

function cleanText(value: unknown, fallback: string, maxLength = 420) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, maxLength);
}

function optionalCleanText(value: unknown, maxLength = 420) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function cleanActionPriority(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function cleanInsightImpact(value: unknown): "high" | "medium" | "low" {
  return cleanActionPriority(value);
}

function aiSnapshotForPeriod(
  snapshots: ReportAiSnapshotInput[],
  period: ReportPeriodKey,
  window: PeriodWindow
) {
  const periodType = periodKeyToSnapshotType(period);
  if (!periodType) {
    return undefined;
  }

  return snapshots
    .filter(
      (snapshot) =>
        snapshot.periodType === periodType &&
        snapshot.periodStart.getTime() === window.start.getTime()
    )
    .sort((left, right) => right.generatedAt.getTime() - left.generatedAt.getTime())[0];
}

export function metricSignature(metrics: ReportMetric[]) {
  return metrics.map((metric) => ({
    label: metric.label,
    value: metric.value,
    delta: metric.delta,
    trend: metric.trend,
    helper: metric.helper,
  }));
}

// Reports' own KPI row shows exactly these three as headline numbers
// (AGENTS.md) — analytics-ai.ts's prompt payload needs their deltas
// specifically because currentRuleSnapshot's prose only ever narrates
// whichever single metric the rule-based narration happened to pick (e.g.
// completion rate when it's the standout), silently omitting the others'
// change context (Codex finding on the OpenAI payload trim). Dropping the
// full 8-entry metrics array from that payload was still correct — this
// keeps only the 3 the AI is actually expected to explain "what changed"
// for, and drops the display-only `helper` field.
const KEY_METRIC_LABELS = ["Appointments", "Completion rate", "New clients"];

export function buildKeyMetrics(period: Pick<ReportPeriodView, "metrics">) {
  return period.metrics
    .filter((metric) => KEY_METRIC_LABELS.includes(metric.label))
    .map((metric) => ({
      label: metric.label,
      value: metric.value,
      delta: metric.delta,
      trend: metric.trend,
    }));
}

export function chartSignature(points: ReportChartPoint[]) {
  return points.map((point) => ({
    label: point.label,
    value: point.value,
  }));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce(
        (result, key) => {
          result[key] = stableValue((value as Record<string, unknown>)[key]);
          return result;
        },
        {} as Record<string, unknown>
      );
  }

  return value ?? null;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function isAiSnapshotFreshForView(
  snapshot: ReportAiSnapshotInput | undefined,
  metrics: ReportMetric[],
  chartPoints: ReportChartPoint[],
  diagnostics: ReportPeriodDiagnostics
) {
  if (!snapshot || typeof snapshot.kpiPayload !== "object" || snapshot.kpiPayload === null) {
    return false;
  }

  const payload = snapshot.kpiPayload as Record<string, unknown>;
  const payloadMetrics = Array.isArray(payload.metrics) ? payload.metrics : [];
  const payloadTrend = Array.isArray(payload.trend) ? payload.trend : [];
  const payloadDiagnostics = payload.diagnostics ?? null;

  return (
    stableJson(payloadMetrics) === stableJson(metricSignature(metrics)) &&
    stableJson(payloadTrend) === stableJson(chartSignature(chartPoints)) &&
    stableJson(payloadDiagnostics) === stableJson(diagnostics)
  );
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatPercentShort(value: number) {
  return `${value.toFixed(0)}%`;
}

function formatHourLabel(hour: number) {
  const normalized = Math.max(0, Math.min(23, hour));
  const suffix = normalized >= 12 ? "PM" : "AM";
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;

  return `${hour12} ${suffix}`;
}

function statusLabel(status: Appointment["status"]) {
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "CONFIRMED") return "Confirmed";
  return "Pending";
}

function formatCountChange(current: number, previous: number) {
  const change = current - previous;

  if (change === 0) {
    return {
      delta: "0",
      trend: "flat" as const,
    };
  }

  return {
    delta: `${change > 0 ? "+" : ""}${change.toLocaleString("en-US")}`,
    trend: change > 0 ? ("up" as const) : ("down" as const),
  };
}

function formatPointChange(
  current: number,
  previous: number,
  options?: { inverse?: boolean }
) {
  const change = current - previous;

  if (Math.abs(change) < 0.1) {
    return {
      delta: "0 pts",
      trend: "flat" as const,
    };
  }

  const trend = options?.inverse
    ? change > 0
      ? "down"
      : "up"
    : change > 0
      ? "up"
      : "down";

  return {
    delta: `${change > 0 ? "+" : ""}${change.toFixed(1).replace(/\.0$/, "")} pts`,
    trend: trend as ReportMetricTrend,
  };
}

function formatMinuteChange(current: number, previous: number) {
  const change = current - previous;

  if (change === 0) {
    return {
      delta: "0m",
      trend: "flat" as const,
    };
  }

  return {
    delta: `${change > 0 ? "+" : ""}${change}m`,
    trend: change > 0 ? ("up" as const) : ("down" as const),
  };
}

function unmeasuredDelta() {
  return {
    delta: "",
    trend: "flat" as const,
  };
}

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

function formatComparisonLabel(period: ReportPeriodKey) {
  if (period === "daily") {
    return "vs yesterday";
  }

  if (period === "weekly") {
    return "vs last week";
  }

  if (period === "custom") {
    return "vs previous range";
  }

  return "vs last month";
}

function formatRangeLabel(window: PeriodWindow, period: ReportPeriodKey, timeZone: string) {
  if (period === "daily") {
    return formatZonedShortDate(window.start, timeZone);
  }

  if (period === "weekly") {
    return `${formatZonedShortDate(window.start, timeZone)} - ${formatZonedShortDate(
      window.end,
      timeZone
    )}`;
  }

  if (period === "custom") {
    return `${formatZonedShortDate(window.start, timeZone)} - ${formatZonedShortDate(
      window.end,
      timeZone
    )}`;
  }

  return formatZonedMonthYear(window.start, timeZone);
}

function isBookedStatus(status: Appointment["status"]) {
  return status !== "CANCELLED";
}

function countDistinct<T>(values: T[]) {
  return new Set(values).size;
}

// Requires `appointments` sorted ascending by startAt (the view builder sorts
// once up front). Binary-searches the inclusive [start, end] range — O(log n)
// per call instead of scanning the whole array, which compounds across the many
// per-window and per-chart-bucket filters. Output matches the previous
// isWithinInterval filter exactly (inclusive on both ends).
function filterAppointmentsInRange(
  appointments: ReportAppointment[],
  start: Date,
  end: Date
) {
  const startMs = start.getTime();
  const endMs = end.getTime();

  // First index with startAt >= start.
  let lo = 0;
  let hi = appointments.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (appointments[mid].startAt.getTime() < startMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const from = lo;

  // First index (at or after `from`) with startAt > end.
  hi = appointments.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (appointments[mid].startAt.getTime() <= endMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return appointments.slice(from, lo);
}

function filterMessagesInRange(
  messages: Array<Pick<Message, "direction" | "sentAt">>,
  start: Date,
  end: Date
) {
  return messages.filter((message) =>
    isWithinInterval(message.sentAt, { start, end })
  );
}

function filterClientsInRange(
  clients: Array<Pick<Client, "createdAt" | "isArchived">>,
  start: Date,
  end: Date
) {
  return clients.filter(
    (client) =>
      !client.isArchived && isWithinInterval(client.createdAt, { start, end })
  );
}

function buildCapacityMinutes(
  window: PeriodWindow,
  businessHours: Array<Pick<BusinessHours, "weekday" | "isOpen" | "startTime" | "endTime">>,
  scheduleBlocks: Array<Pick<ScheduleBlock, "startsAt" | "endsAt">>,
  activeStaffCount: number,
  timeZone: string
) {
  const safeStaffCount = Math.max(activeStaffCount, 1);
  const startParts = getZonedDateParts(window.start, timeZone);
  const endParts = getZonedDateParts(window.end, timeZone);
  const localStartDate = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const localEndDate = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  const dayCount = Math.max(
    Math.floor((localEndDate - localStartDate) / 86_400_000) + 1,
    1
  );

  return Array.from({ length: dayCount }, (_, index) => addZonedDays(startParts, index)).reduce(
    (total, dayParts) => {
      const localDate = new Date(Date.UTC(dayParts.year, dayParts.month - 1, dayParts.day));
      const weekday = (localDate.getUTCDay() + 6) % 7;
      const schedule = businessHours.find((item) => item.weekday === weekday);

      if (!schedule?.isOpen) {
        return total;
      }

      const dayStartMinutes = parseTimeToMinutes(schedule.startTime);
      const dayEndMinutes = parseTimeToMinutes(schedule.endTime);
      const openMinutes = Math.max(dayEndMinutes - dayStartMinutes, 0);

      // A business-wide ScheduleBlock inside open hours isn't real capacity —
      // an appointment can't be booked into it. Skip the timezone conversion
      // below entirely when there's nothing to check (the common case).
      if (scheduleBlocks.length === 0) {
        return total + openMinutes * safeStaffCount;
      }

      // Wall-clock minutes-since-midnight throughout — never elapsed real
      // time — so this stays comparable to openMinutes above, which is also
      // wall-clock (a 09:00-17:00 window is 480 minutes of bookable time
      // regardless of what DST does that day). Converting through UTC
      // instants and taking their elapsed-ms difference (the previous
      // version) measured a different duration than openMinutes on a day
      // with a DST transition inside the window, over- or under-counting
      // capacity by the shift (Codex P2).
      const dayKey = Date.UTC(dayParts.year, dayParts.month - 1, dayParts.day);
      const blockedIntervals = scheduleBlocks.flatMap((block) => {
        const blockStartParts = getZonedDateParts(block.startsAt, timeZone);
        const blockEndParts = getZonedDateParts(block.endsAt, timeZone);
        const blockStartKey = Date.UTC(
          blockStartParts.year,
          blockStartParts.month - 1,
          blockStartParts.day
        );
        const blockEndKey = Date.UTC(blockEndParts.year, blockEndParts.month - 1, blockEndParts.day);

        if (dayKey < blockStartKey || dayKey > blockEndKey) {
          return []; // doesn't touch this calendar day at all
        }

        // A block only carries its real clock time on the day it actually
        // starts/ends — every day in between (and the whole day, on either
        // boundary that isn't also the other boundary) is blocked start-of-
        // day to end-of-day.
        const blockStartMinutesToday = dayKey === blockStartKey
          ? blockStartParts.hour * 60 + blockStartParts.minute
          : 0;
        const blockEndMinutesToday = dayKey === blockEndKey
          ? blockEndParts.hour * 60 + blockEndParts.minute
          : 24 * 60;

        return [{
          start: Math.max(dayStartMinutes, blockStartMinutesToday),
          end: Math.min(dayEndMinutes, blockEndMinutesToday),
        }];
      });
      // sumMergedIntervals merges overlapping blocks before summing, so two
      // ScheduleBlocks covering the same hour don't get subtracted twice.
      const blockedMinutes = sumMergedIntervals(blockedIntervals);
      const minutes = Math.max(openMinutes - blockedMinutes, 0);

      return total + minutes * safeStaffCount;
    },
    0
  );
}

function buildPeriodStats(args: {
  appointments: ReportAppointment[];
  clients: Array<Pick<Client, "createdAt" | "isArchived">>;
  messages: Array<Pick<Message, "direction" | "sentAt">>;
  businessHours: Array<Pick<BusinessHours, "weekday" | "isOpen" | "startTime" | "endTime">>;
  scheduleBlocks: Array<Pick<ScheduleBlock, "startsAt" | "endsAt">>;
  activeStaffCount: number;
  unreadMessages: number;
  window: PeriodWindow;
  timeZone: string;
}): PeriodStats {
  const {
    appointments,
    clients,
    messages,
    businessHours,
    scheduleBlocks,
    activeStaffCount,
    unreadMessages,
    window,
    timeZone,
  } = args;
  const scopedAppointments = filterAppointmentsInRange(appointments, window.start, window.end);
  const finalizedAppointments = scopedAppointments.filter(
    (appointment) =>
      appointment.status === "COMPLETED" || appointment.status === "CANCELLED"
  );
  const completedAppointments = scopedAppointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  );
  const cancelledAppointments = scopedAppointments.filter(
    (appointment) => appointment.status === "CANCELLED"
  );
  const bookedMinutes = scopedAppointments
    .filter((appointment) => isBookedStatus(appointment.status))
    .reduce(
      (total, appointment) =>
        total + Math.max(differenceInMinutes(appointment.endAt, appointment.startAt), 0),
      0
    );
  const capacityMinutes = buildCapacityMinutes(
    window,
    businessHours,
    scheduleBlocks,
    activeStaffCount,
    timeZone
  );
  const scopedClients = filterClientsInRange(clients, window.start, window.end);
  const scopedMessages = filterMessagesInRange(messages, window.start, window.end);
  const outboundMessages = scopedMessages.filter(
    (message) => message.direction === "OUTBOUND"
  ).length;
  const inboundMessages = scopedMessages.filter(
    (message) => message.direction === "INBOUND"
  ).length;
  const repeatClientVisits = new Map<string, number>();

  completedAppointments.forEach((appointment) => {
    repeatClientVisits.set(
      appointment.clientId,
      (repeatClientVisits.get(appointment.clientId) ?? 0) + 1
    );
  });

  const distinctCompletedClients = countDistinct(
    completedAppointments.map((appointment) => appointment.clientId)
  );
  const repeatClients = Array.from(repeatClientVisits.values()).filter(
    (count) => count > 1
  ).length;

  return {
    scheduledCount: scopedAppointments.length,
    finalizedCount: finalizedAppointments.length,
    completedCount: completedAppointments.length,
    cancelledCount: cancelledAppointments.length,
    bookedMinutes,
    completionRate:
      finalizedAppointments.length > 0
        ? (completedAppointments.length / finalizedAppointments.length) * 100
        : 0,
    lostSlotRate:
      finalizedAppointments.length > 0
        ? (cancelledAppointments.length / finalizedAppointments.length) * 100
        : 0,
    capacityMinutes,
    // A ScheduleBlock can drive a day's capacity to exactly 0 while a real
    // booking still exists under it — saveAppointmentAction validates against
    // BusinessHours but never ScheduleBlock, and a block can also be created
    // after the booking. Reporting flat 0% there (Codex P1) reads as "no
    // capacity was used" when the opposite is true; treat it the same as any
    // other over-capacity case (already reachable and already capped at 999,
    // not a new class of value this introduces).
    utilizationRate:
      capacityMinutes > 0
        ? Math.min((bookedMinutes / capacityMinutes) * 100, 999)
        : bookedMinutes > 0
          ? 999
          : 0,
    newClients: scopedClients.length,
    repeatVisitRate:
      distinctCompletedClients > 0 ? (repeatClients / distinctCompletedClients) * 100 : 0,
    outboundMessages,
    inboundMessages,
    followUpRate: inboundMessages > 0 ? (outboundMessages / inboundMessages) * 100 : 0,
    averageVisitLength:
      completedAppointments.length > 0
        ? Math.round(
            completedAppointments.reduce(
              (total, appointment) =>
                total + Math.max(differenceInMinutes(appointment.endAt, appointment.startAt), 0),
              0
            ) / completedAppointments.length
          )
        : 0,
    unreadMessages,
  };
}

function buildPeriodDiagnostics(args: {
  appointments: ReportAppointment[];
  clientMix: ReportClientMix;
  staffMembers: Array<Pick<StaffMember, "id" | "name" | "role" | "status" | "isActive">>;
  window: PeriodWindow;
  timeZone: string;
}): ReportPeriodDiagnostics {
  const scopedAppointments = filterAppointmentsInRange(
    args.appointments,
    args.window.start,
    args.window.end
  );
  const bookedAppointments = scopedAppointments.filter((appointment) =>
    isBookedStatus(appointment.status)
  );
  const totalAppointments = Math.max(scopedAppointments.length, 1);
  const statusMix = (["COMPLETED", "CONFIRMED", "PENDING", "CANCELLED"] as const).map(
    (status) => {
      const count = scopedAppointments.filter(
        (appointment) => appointment.status === status
      ).length;

      return {
        label: statusLabel(status),
        count,
        share: formatPercent((count / totalAppointments) * 100),
      };
    }
  );
  const dayCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();
  const staffCounts = new Map<string, { appointments: number; bookedMinutes: number }>();
  let totalBookedMinutes = 0;
  let totalLeadTimeHours = 0;
  let leadTimeCount = 0;
  let sameDayBookings = 0;
  let unassignedAppointments = 0;

  scopedAppointments.forEach((appointment) => {
    const dayLabel = formatZonedDayName(appointment.startAt, args.timeZone);
    const hour = getZonedDateParts(appointment.startAt, args.timeZone).hour;
    const duration = Math.max(
      differenceInMinutes(appointment.endAt, appointment.startAt),
      0
    );
    const leadTimeHours = Math.max(
      differenceInMinutes(appointment.startAt, appointment.createdAt) / 60,
      0
    );

    dayCounts.set(dayLabel, (dayCounts.get(dayLabel) ?? 0) + 1);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);

    if (appointment.staffMemberId) {
      const current = staffCounts.get(appointment.staffMemberId) ?? {
        appointments: 0,
        bookedMinutes: 0,
      };
      staffCounts.set(appointment.staffMemberId, {
        appointments: current.appointments + 1,
        bookedMinutes: current.bookedMinutes + (isBookedStatus(appointment.status) ? duration : 0),
      });
    } else {
      unassignedAppointments += 1;
    }

    if (isBookedStatus(appointment.status)) {
      totalBookedMinutes += duration;
    }

    totalLeadTimeHours += leadTimeHours;
    leadTimeCount += 1;

    if (leadTimeHours <= 24) {
      sameDayBookings += 1;
    }
  });

  // Deterministic tiebreakers (label / hour) so equal-count days/hours order the
  // same regardless of appointment iteration order — the row order is otherwise
  // arbitrary (no orderBy on the fetch), which made these lists non-deterministic.
  const sortedDays = Array.from(dayCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  const busiestHours = Array.from(hourCounts.entries())
    .sort(([hourLeft, countLeft], [hourRight, countRight]) => countRight - countLeft || hourLeft - hourRight)
    .slice(0, 3)
    .map(([hour, count]) => ({
      label: formatHourLabel(hour),
      count,
    }));
  const staffLoad = args.staffMembers
    .filter((member) => member.isActive && member.status !== "INACTIVE")
    .map((member) => {
      const load = staffCounts.get(member.id) ?? {
        appointments: 0,
        bookedMinutes: 0,
      };

      return {
        name: member.name,
        role: member.role,
        appointments: load.appointments,
        bookedMinutes: load.bookedMinutes,
        utilizationShare:
          totalBookedMinutes > 0
            ? formatPercent((load.bookedMinutes / totalBookedMinutes) * 100)
            : "0.0%",
      };
    })
    .sort((left, right) => right.bookedMinutes - left.bookedMinutes)
    .slice(0, 6);
  // Whole-base client composition is precomputed in the data layer (bounded
  // aggregate) and passed in — it does not depend on the period window.
  const clientMix = args.clientMix;
  const completion = statusMix.find((item) => item.label === "Completed");
  const cancelled = statusMix.find((item) => item.label === "Cancelled");
  const busiestDay = sortedDays[0];
  const nonEmptyDays = sortedDays.filter((item) => item.count > 0);
  const quietestDay = nonEmptyDays[nonEmptyDays.length - 1];

  return {
    statusMix,
    demandWindows: {
      busiestDays: sortedDays.slice(0, 3),
      quietestDays: sortedDays.slice().reverse().slice(0, 3),
      busiestHours,
    },
    staffLoad,
    bookingBehavior: {
      averageLeadTimeHours:
        leadTimeCount > 0 ? Math.round(totalLeadTimeHours / leadTimeCount) : 0,
      sameDayBookings,
      unassignedAppointments,
    },
    clientMix,
    evidenceSummary: [
      `${completion?.share ?? "0.0%"} completed and ${cancelled?.share ?? "0.0%"} cancelled`,
      busiestDay ? `busiest day ${busiestDay.label} (${busiestDay.count})` : null,
      quietestDay ? `quietest day ${quietestDay.label} (${quietestDay.count})` : null,
      bookedAppointments.length > 0
        ? `${sameDayBookings} same-day booking${sameDayBookings === 1 ? "" : "s"}`
        : null,
      unassignedAppointments > 0
        ? `${unassignedAppointments} unassigned appointment${unassignedAppointments === 1 ? "" : "s"}`
        : null,
    ]
      .filter(Boolean)
      .join("; "),
  };
}

function clampScoreComponent(value: number, max: number) {
  return Math.max(0, Math.min(value, max));
}

function scorePeriod(stats: PeriodStats) {
  const completionScore =
    stats.finalizedCount > 0
      ? clampScoreComponent((stats.completionRate / 100) * 26, 26)
      : stats.scheduledCount > 0
        ? 14
        : 8;
  const lostSlotScore =
    stats.finalizedCount > 0
      ? clampScoreComponent(((100 - stats.lostSlotRate) / 100) * 18, 18)
      : stats.scheduledCount > 0
        ? 10
        : 7;
  const utilizationScore =
    stats.capacityMinutes <= 0
      ? 10
      : stats.utilizationRate <= 0
        ? 0
        : stats.utilizationRate < 70
          ? clampScoreComponent((stats.utilizationRate / 70) * 24, 24)
          : stats.utilizationRate <= 92
            ? 24
            : clampScoreComponent(24 - (stats.utilizationRate - 92) * 0.55, 24);
  const demandScore = clampScoreComponent(stats.scheduledCount * 2.5 + stats.newClients * 1.5, 12);
  const retentionScore =
    stats.completedCount > 0
      ? clampScoreComponent(4 + (stats.repeatVisitRate / 25) * 6, 10)
      : stats.scheduledCount > 1
        ? 4
        : 2;
  const followUpScore =
    stats.inboundMessages === 0
      ? 6
      : clampScoreComponent((stats.followUpRate / 100) * 6, 6);
  const inboxScore = stats.unreadMessages > 5 ? 0 : 4;

  return Math.max(
    15,
    Math.min(
      Math.round(
        completionScore +
          lostSlotScore +
          utilizationScore +
          demandScore +
          retentionScore +
          followUpScore +
          inboxScore
      ),
      100
    )
  );
}

function toneFromScore(score: number): ReportSnapshotTone {
  if (score >= 85) {
    return "strong";
  }

  if (score >= 70) {
    return "healthy";
  }

  if (score >= 55) {
    return "watch";
  }

  return "attention";
}

function buildPerformanceSummary(stats: PeriodStats, deltas: {
  appointments: { delta: string; trend: ReportMetricTrend };
}) {
  if (stats.scheduledCount === 0) {
    return "No appointments are booked in this timeframe yet, so the report is using capacity, client, inbox, and schedule setup data until visit activity starts.";
  }

  const bookedHours = (stats.bookedMinutes / 60).toFixed(1).replace(/\.0$/, "");
  const completion =
    stats.finalizedCount > 0
      ? `${formatPercent(stats.completionRate)} completion across ${stats.finalizedCount} finalized visit${
          stats.finalizedCount === 1 ? "" : "s"
        }`
      : "no finalized visits yet";
  const movement =
    deltas.appointments.trend === "up"
      ? `booked activity is up ${deltas.appointments.delta}`
      : deltas.appointments.trend === "down"
        ? `booked activity is down ${deltas.appointments.delta}`
        : "booked activity is flat";

  return `${stats.scheduledCount} appointment${stats.scheduledCount === 1 ? "" : "s"} are on the schedule, covering ${bookedHours} booked hour${
    bookedHours === "1" ? "" : "s"
  }; ${completion}, and ${movement}.`;
}

function buildStrength(stats: PeriodStats, periodLabel: string) {
  if (stats.scheduledCount === 0) {
    return `There are no booked appointments ${periodLabel}, so the clearest signal is unused capacity rather than visit execution.`;
  }

  if (stats.finalizedCount === 0) {
    return `${stats.scheduledCount} appointment${stats.scheduledCount === 1 ? "" : "s"} are booked ${periodLabel}, but none are finalized yet, so execution quality is still unproven.`;
  }

  if (stats.completionRate >= 90 && stats.lostSlotRate <= 8) {
    return `Visit execution is reliable: ${formatPercent(stats.completionRate)} completed with only ${formatPercent(
      stats.lostSlotRate
    )} lost slots.`;
  }

  if (stats.utilizationRate >= 70 && stats.utilizationRate <= 92) {
    return `Capacity is being used well at ${formatPercent(stats.utilizationRate)} estimated utilization, which is a healthy operating range.`;
  }

  if (stats.newClients > 0) {
    return `${stats.newClients} new client${stats.newClients === 1 ? "" : "s"} entered the clinic ${periodLabel}, which keeps acquisition moving.`;
  }

  return `${stats.completedCount} completed visit${stats.completedCount === 1 ? "" : "s"} give the clinic a measurable baseline ${periodLabel}.`;
}

function buildWatch(stats: PeriodStats) {
  if (stats.scheduledCount === 0) {
    return `There are 0 booked appointments while utilization is ${formatPercent(stats.utilizationRate)}, so open capacity is the main issue.`;
  }

  if (stats.finalizedCount === 0) {
    return `${stats.scheduledCount} appointment${stats.scheduledCount === 1 ? "" : "s"} are booked but not finalized yet, so completion and lost-slot rates cannot be judged from outcomes.`;
  }

  if (stats.lostSlotRate > 10) {
    return `Lost-slot pressure is high at ${formatPercent(stats.lostSlotRate)} across ${stats.cancelledCount} cancelled visit${
      stats.cancelledCount === 1 ? "" : "s"
    }. Missed or cancelled visits are the clearest source of preventable leakage.`;
  }

  // A booking sitting inside a fully-blocked/closed window still forces
  // utilizationRate to the 999% sentinel (see buildCapacityMinutes) — a
  // configuration conflict, not a real demand-vs-capacity signal. Must never
  // read as "near overload" below (Codex P1 — the earlier fix only gated the
  // delta/comparison arrow, not this narration).
  if (stats.capacityMinutes <= 0) {
    return "Estimated utilization can't be measured this period — there's no configured open capacity to compare bookings against (closed hours, or a schedule block covering the window).";
  }

  if (stats.utilizationRate < 55) {
    return `Estimated utilization is only ${formatPercent(stats.utilizationRate)}. Open hours are not turning into enough booked care time.`;
  }

  if (stats.utilizationRate > 95) {
    return `Estimated utilization is ${formatPercent(stats.utilizationRate)}, which risks overload and weaker patient experience.`;
  }

  if (stats.repeatVisitRate < 25) {
    return `Repeat-visit rate is ${formatPercent(stats.repeatVisitRate)}. The clinic is not yet pulling enough return demand from recent patients.`;
  }

  if (stats.inboundMessages > 0 && stats.followUpRate < 50) {
    return `Only ${formatPercent(stats.followUpRate)} of inbound message volume is matched by outbound follow-up. Response discipline is still weak.`;
  }

  return `No single operational risk dominates right now: completion is ${formatPercent(stats.completionRate)}, lost slots are ${formatPercent(stats.lostSlotRate)}, and utilization is ${formatPercent(stats.utilizationRate)}.`;
}

function buildFocus(stats: PeriodStats) {
  if (stats.scheduledCount === 0) {
    return "Create measurable demand first: book upcoming visits, reactivate existing clients, and fill the next available open slots.";
  }

  if (stats.finalizedCount === 0) {
    return "Get booked appointments to a clear outcome by confirming attendance, completing finished visits, and marking cancellations quickly.";
  }

  if (stats.lostSlotRate > 10) {
    return "Tighten reminders, confirm uncertain appointments earlier, and use the inbox for same-day recovery when a slot is at risk.";
  }

  if (stats.capacityMinutes <= 0) {
    return "Check business hours and schedule blocks for this period — utilization can't be estimated without real open capacity to compare against.";
  }

  if (stats.utilizationRate < 55 && stats.newClients === 0) {
    return "Push reactivation: bring back older clients, reduce empty hours, and make the next available appointment easier to book.";
  }

  if (stats.utilizationRate < 55) {
    return "Keep acquisition active, but turn more demand into attended visits by reducing no-shows and simplifying rescheduling.";
  }

  if (stats.utilizationRate > 95) {
    return "Protect quality by adding staff coverage, extending open hours, or creating more buffer between visits.";
  }

  if (stats.repeatVisitRate < 25) {
    return "Focus on retention: follow up after completed visits and create a clearer path to the next appointment before the client leaves.";
  }

  if (stats.inboundMessages > 0 && stats.followUpRate < 50) {
    return "Improve inbox handling. Faster replies and more outbound follow-up should convert more conversations into booked care.";
  }

  return "Keep reinforcing what works: preserve completion quality, hold cancellations down, and monitor whether growth stays manageable.";
}

function buildPrimaryConstraint(stats: PeriodStats) {
  if (stats.scheduledCount === 0) {
    return {
      title: "No booked demand in this timeframe",
      metric: "Appointments",
      value: "0 booked",
      severity: "high" as const,
    };
  }

  if (stats.finalizedCount === 0) {
    return {
      title: "Booked visits need final outcomes",
      metric: "Finalized visits",
      value: "0 finalized",
      severity: "medium" as const,
    };
  }

  if (stats.lostSlotRate > 10) {
    return {
      title: "Lost slots are reducing usable capacity",
      metric: "Lost-slot rate",
      value: formatPercent(stats.lostSlotRate),
      severity: "high" as const,
    };
  }

  if (stats.capacityMinutes <= 0) {
    return {
      title: "Utilization can't be measured for this period",
      metric: "Estimated utilization",
      value: "Unmeasured",
      severity: "low" as const,
    };
  }

  if (stats.utilizationRate < 55) {
    return {
      title: "Open capacity is not converting into visits",
      metric: "Estimated utilization",
      value: formatPercent(stats.utilizationRate),
      severity: "high" as const,
    };
  }

  if (stats.utilizationRate > 95) {
    return {
      title: "Schedule is near overload",
      metric: "Estimated utilization",
      value: formatPercent(stats.utilizationRate),
      severity: "medium" as const,
    };
  }

  if (stats.repeatVisitRate < 25) {
    return {
      title: "Return demand needs more follow-up",
      metric: "Repeat-visit rate",
      value: formatPercent(stats.repeatVisitRate),
      severity: "medium" as const,
    };
  }

  if (stats.inboundMessages > 0 && stats.followUpRate < 50) {
    return {
      title: "Inbound demand needs stronger response",
      metric: "Follow-up coverage",
      value: formatPercent(stats.followUpRate),
      severity: "medium" as const,
    };
  }

  return {
    title: "No dominant operating constraint",
    metric: "Performance score",
    value: `${scorePeriod(stats)}/100`,
    severity: "low" as const,
  };
}

function buildDynamicPlaybookSteps(stats: PeriodStats) {
  if (stats.scheduledCount === 0) {
    return [
      `Book at least 1 appointment into the open schedule for this period.`,
      `Use the client list to contact inactive or at-risk clients before the next report.`,
      "Check utilization again after the schedule has booked minutes to measure.",
    ];
  }

  if (stats.finalizedCount === 0) {
    return [
      `Confirm the ${stats.scheduledCount} booked appointment${stats.scheduledCount === 1 ? "" : "s"} before they start.`,
      "Mark each visit completed or cancelled as soon as the outcome is known.",
      "Refresh reports after outcomes are recorded so completion and lost-slot rates become measurable.",
    ];
  }

  if (stats.lostSlotRate > 10) {
    return [
      `Review the ${stats.cancelledCount} cancelled visit${stats.cancelledCount === 1 ? "" : "s"} and identify avoidable causes.`,
      "Send confirmation messages earlier for appointments that look uncertain.",
      "Offer same-day rescheduling when a cancellation frees a slot.",
    ];
  }

  // Same sentinel guard as buildWatch/buildFocus/buildPrimaryConstraint —
  // otherwise this recommended "add staff coverage" for a config artifact,
  // not a real capacity problem (Codex P1, same class).
  if (stats.capacityMinutes <= 0) {
    return [
      "Check business hours and schedule blocks for this period before trusting utilization.",
      "Confirm the closed hours or schedule block covering this window are intentional.",
      "Re-run this report once real open capacity exists to measure utilization again.",
    ];
  }

  if (stats.utilizationRate < 55) {
    return [
      `Raise booked capacity from ${formatPercent(stats.utilizationRate)} toward 70%.`,
      stats.newClients > 0
        ? `Convert the ${stats.newClients} new client${stats.newClients === 1 ? "" : "s"} into attended visits.`
        : "Reactivate inactive clients and fill the next available open slots.",
      "Review empty hours and move demand toward the quietest parts of the schedule.",
    ];
  }

  if (stats.utilizationRate > 95) {
    return [
      `Reduce pressure from ${formatPercent(stats.utilizationRate)} utilization toward the 70-92% range.`,
      "Add buffer time around longer visits or move overflow demand to another staff member.",
      "Watch completion and cancellation changes after capacity pressure is reduced.",
    ];
  }

  if (stats.repeatVisitRate < 25) {
    return [
      `Lift repeat visits from ${formatPercent(stats.repeatVisitRate)} toward 25%.`,
      "Ask completed clients to book their next visit before leaving the clinic.",
      "Send follow-up messages to completed clients without another visit booked.",
    ];
  }

  if (stats.inboundMessages > 0 && stats.followUpRate < 50) {
    return [
      `Improve follow-up coverage from ${formatPercent(stats.followUpRate)} toward 80% or higher.`,
      `Reply to the ${stats.inboundMessages} inbound message${stats.inboundMessages === 1 ? "" : "s"} counted in this period.`,
      "Turn unresolved conversations into booked visits or clear next steps.",
    ];
  }

  return [
    `Protect ${formatPercent(stats.completionRate)} completion by keeping confirmations consistent.`,
    `Keep lost slots near ${formatPercent(stats.lostSlotRate)} or lower.`,
    `Hold utilization inside the healthy 70-92% range; current utilization is ${formatPercent(stats.utilizationRate)}.`,
  ];
}

function buildWhatToMonitor(stats: PeriodStats) {
  const monitors = [
    {
      metric: "Appointments",
      target:
        stats.scheduledCount === 0
          ? "Move from 0 booked appointments to at least 1 booked visit."
          : `Protect or grow the current ${stats.scheduledCount} booked appointment${
              stats.scheduledCount === 1 ? "" : "s"
            }.`,
    },
    {
      metric: "Estimated utilization",
      target:
        stats.capacityMinutes <= 0
          ? "Utilization can't be measured this period — there's no configured open capacity to compare against."
          : `Current estimated utilization is ${formatPercent(stats.utilizationRate)}; healthy range is 70-92%.`,
    },
  ];

  if (stats.finalizedCount > 0) {
    monitors.push({
      metric: "Completion rate",
      target: `Current completion is ${formatPercent(stats.completionRate)}; keep finalized visits above 90% completed.`,
    });
  } else {
    monitors.push({
      metric: "Finalized visits",
      target: "Record completed or cancelled outcomes so completion quality becomes measurable.",
    });
  }

  return monitors;
}

function buildSnapshot(
  period: ReportPeriodKey,
  stats: PeriodStats,
  deltas: {
    appointments: { delta: string; trend: ReportMetricTrend };
    completion: { delta: string; trend: ReportMetricTrend };
    utilization: { delta: string; trend: ReportMetricTrend };
    clients: { delta: string; trend: ReportMetricTrend };
  }
): ReportSnapshot {
  const score = scorePeriod(stats);
  const tone = toneFromScore(score);
  const periodLabel =
    period === "daily"
      ? "today"
      : period === "weekly"
        ? "this week"
        : period === "custom"
          ? "for this range"
          : "this month";

  const headline =
    tone === "strong"
      ? `Clinic performance is strong ${periodLabel}.`
      : tone === "healthy"
        ? `Clinic performance is healthy ${periodLabel}.`
        : tone === "watch"
          ? `Clinic performance needs watching ${periodLabel}.`
          : `Clinic performance needs attention ${periodLabel}.`;

  const summary = buildPerformanceSummary(stats, deltas);
  const strength = buildStrength(stats, periodLabel);
  const watch = buildWatch(stats);
  const focus = buildFocus(stats);
  const primaryConstraint = buildPrimaryConstraint(stats);
  const monitorTargets = buildWhatToMonitor(stats);

  return {
    score,
    tone,
    headline,
    summary,
    diagnosis: watch,
    severity: tone === "attention" || tone === "watch" ? "high" : "medium",
    confidence: stats.scheduledCount >= 8 ? "medium" : "low",
    strength,
    watch,
    focus,
    deepDive: `${summary} ${watch} ${focus}`,
    rootCauses: [
      {
        title: primaryConstraint.title,
        evidence: watch,
        severity: primaryConstraint.severity,
      },
      {
        title: "Retention and follow-up need regular monitoring",
        evidence: `Repeat visits are ${formatPercent(stats.repeatVisitRate)} and follow-up coverage is ${
          stats.inboundMessages > 0 ? formatPercent(stats.followUpRate) : "not yet measurable"
        }.`,
        severity: stats.repeatVisitRate < 25 ? "medium" : "low",
      },
    ],
    statHighlights: [
      {
        label: "Completion",
        value: formatPercent(stats.completionRate),
        readout:
          stats.completionRate >= 90
            ? "Most finalized visits are turning into completed care."
            : "Completion has room to improve through confirmations and recovery follow-up.",
      },
      {
        label: "Estimated utilization",
        // This feeds the AI/rule-based insight payload, not the Reports KPI
        // tile — showing the raw sentinel here (as opposed to the tile's own
        // deliberate "999% = maximum" display) reads as a real, actionable
        // imbalance rather than the configuration conflict it actually is
        // (Codex P1, same class as buildWatch/buildFocus/buildPrimaryConstraint).
        value: stats.capacityMinutes <= 0 ? "Unmeasured" : formatPercent(stats.utilizationRate),
        readout:
          stats.capacityMinutes <= 0
            ? "No configured open capacity this period — utilization can't be measured."
            : stats.utilizationRate >= 70 && stats.utilizationRate <= 92
              ? "Booked time is sitting in a healthy operating range."
              : "Capacity and demand are not yet balanced for this timeframe.",
      },
      {
        label: "Repeat visits",
        value: formatPercent(stats.repeatVisitRate),
        readout:
          stats.repeatVisitRate >= 25
            ? "Return demand is contributing to the schedule."
            : "Retention follow-up is the clearest growth lever.",
      },
    ],
    opportunities: [
      {
        title: "Convert leakage into booked care",
        detail: focus,
        impact: tone === "attention" || tone === "watch" ? "high" : "medium",
      },
      {
        title: "Keep the strongest operating habit visible",
        detail: strength,
        impact: "medium",
      },
    ],
    recommendedPlaybook: {
      name:
        stats.scheduledCount === 0
          ? "Demand creation"
          : stats.finalizedCount === 0
            ? "Outcome capture"
            : stats.lostSlotRate > 10
              ? "Cancellation recovery"
              : stats.utilizationRate < 55
                ? "Reactivation and booking lift"
                : stats.repeatVisitRate < 25
                  ? "Next-visit retention"
                  : "Maintain operating rhythm",
      why: focus,
      steps: buildDynamicPlaybookSteps(stats),
    },
    whatToMonitor: monitorTargets,
    source: "rules",
    status: "rules",
    statusLabel: "Rule-based insight",
    auditLabel: "Generated from current clinic metrics without AI.",
    actions: [
      {
        title:
          stats.scheduledCount === 0
            ? "Create booked demand"
            : stats.finalizedCount === 0
              ? "Finalize booked visits"
              : "Protect the strongest signal",
        detail: strength,
        priority: "medium",
        metric:
          stats.scheduledCount === 0
            ? "Appointments"
            : stats.finalizedCount === 0
              ? "Finalized visits"
              : "Completion and utilization",
        expectedImpact:
          stats.scheduledCount === 0
            ? "Creates the visit data needed for the next report to diagnose performance."
            : stats.finalizedCount === 0
              ? "Turns booked visits into measurable completion and lost-slot rates."
              : `Protects the current ${score}/100 performance score by preserving the strongest metric signal.`,
      },
      {
        title: `Work ${primaryConstraint.metric.toLowerCase()}`,
        detail: focus,
        priority: tone === "attention" || tone === "watch" ? "high" : "medium",
        metric: primaryConstraint.metric,
        expectedImpact: `Targets ${primaryConstraint.metric.toLowerCase()} at ${primaryConstraint.value}, the clearest constraint in this timeframe.`,
      },
    ],
  };
}

function applyAiSnapshot(
  fallback: ReportSnapshot,
  snapshot: ReportAiSnapshotInput | undefined,
  isFresh: boolean
): ReportSnapshot {
  if (!snapshot) {
    return fallback;
  }

  const generatedAt = snapshot.generatedAt.toISOString();

  if (snapshot.status !== "GENERATED" || !isFresh) {
    return {
      ...fallback,
      status: snapshot.status === "ERRORED" ? "errored" : "fallback",
      statusLabel:
        snapshot.status === "ERRORED"
          ? "AI refresh failed, using rules"
          : "AI unavailable, using rules",
      auditLabel: isFresh
        ? "The current period has an audited rule-based fallback snapshot."
        : "The latest AI snapshot no longer matches the current metrics, so rules are used.",
      unavailableReason:
        !isFresh && snapshot.status === "GENERATED"
          ? "Metrics changed after the last AI snapshot."
          : snapshot.error ?? undefined,
      generatedAt,
      model: snapshot.model ?? undefined,
    };
  }

  if (typeof snapshot.aiPayload !== "object" || snapshot.aiPayload === null) {
    return fallback;
  }

  // rootCauses/actions are the only arrays the trimmed AI_PERIOD_SCHEMA
  // (analytics-ai.ts) still emits (1 item each). statHighlights/opportunities/
  // recommendedPlaybook/whatToMonitor/severity/confidence/strength/watch/
  // deepDive, and actions[].metric/expectedImpact, were dropped from the
  // schema — the AI can never send them again, so they fall through to the
  // rule-based fallback unconditionally instead of being parsed from payload.
  const payload = snapshot.aiPayload as Record<string, unknown>;
  const rawActions = Array.isArray(payload.actions) ? payload.actions : [];
  const rawRootCauses = Array.isArray(payload.rootCauses)
    ? payload.rootCauses
    : [];
  const rootCauses = rawRootCauses
    .filter((item): item is Record<string, unknown> => {
      return typeof item === "object" && item !== null;
    })
    .map((item) => {
      const title = optionalCleanText(item.title, 96);
      const evidence = optionalCleanText(item.evidence, 240);

      return title && evidence
        ? {
            title,
            evidence,
            severity: cleanInsightImpact(item.severity),
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 4);
  const actions = rawActions
    .filter((action): action is Record<string, unknown> => {
      return typeof action === "object" && action !== null;
    })
    .map((action) => {
      const title = optionalCleanText(action.title, 96);
      const detail = optionalCleanText(action.detail ?? action.why, 280);

      return title && detail
        ? {
            title,
            detail,
            priority: cleanActionPriority(action.priority),
            metric: fallback.actions?.[0]?.metric,
            expectedImpact: undefined,
          }
        : null;
    })
    .filter((action): action is NonNullable<typeof action> => action !== null)
    .slice(0, 4);

  return {
    score: fallback.score,
    tone: fallback.tone,
    headline: cleanText(payload.headline, fallback.headline, 160),
    summary: cleanText(payload.summary, fallback.summary, 420),
    diagnosis: cleanText(payload.diagnosis, fallback.diagnosis ?? fallback.watch, 420),
    severity: fallback.severity,
    confidence: fallback.confidence,
    strength: fallback.strength,
    watch: fallback.watch,
    focus: cleanText(payload.focus, fallback.focus, 420),
    deepDive: fallback.deepDive ?? fallback.summary,
    rootCauses: rootCauses.length > 0 ? rootCauses : fallback.rootCauses,
    statHighlights: fallback.statHighlights,
    opportunities: fallback.opportunities,
    recommendedPlaybook: fallback.recommendedPlaybook,
    whatToMonitor: fallback.whatToMonitor,
    source: "ai",
    status: "generated",
    statusLabel: "AI generated",
    auditLabel: "AI text was generated from the saved metrics snapshot; score is recalculated from current clinic metrics.",
    generatedAt,
    model: snapshot.model ?? undefined,
    actions: actions.length > 0 ? actions : fallback.actions,
  };
}

function buildMetrics(args: {
  current: PeriodStats;
  previous: PeriodStats;
  comparisonLabel: string;
}) {
  const { current, previous, comparisonLabel } = args;
  const appointmentDelta = formatCountChange(current.scheduledCount, previous.scheduledCount);
  const completionDelta =
    current.finalizedCount > 0 && previous.finalizedCount > 0
      ? formatPointChange(current.completionRate, previous.completionRate)
      : unmeasuredDelta();
  const lostSlotDelta =
    current.finalizedCount > 0 && previous.finalizedCount > 0
      ? formatPointChange(current.lostSlotRate, previous.lostSlotRate, { inverse: true })
      : unmeasuredDelta();
  // Every other rate metric above already gates its delta on both periods
  // having enough data to compare — utilizationRate was the one exception.
  // Without this, a period with bookings but zero measured capacity (a
  // closed day, missing business hours, or a schedule block covering the
  // whole window) reports the 999% sentinel, and diffing that against a
  // normal period's percentage produced a nonsensical multi-hundred-point
  // swing that read as a catastrophic utilization change rather than the
  // configuration mismatch it actually is (Codex P1).
  const utilizationDelta =
    current.capacityMinutes > 0 && previous.capacityMinutes > 0
      ? formatPointChange(current.utilizationRate, previous.utilizationRate)
      : unmeasuredDelta();
  const newClientsDelta = formatCountChange(current.newClients, previous.newClients);
  const repeatVisitDelta =
    current.completedCount > 0 && previous.completedCount > 0
      ? formatPointChange(current.repeatVisitRate, previous.repeatVisitRate)
      : unmeasuredDelta();
  const followUpDelta =
    current.inboundMessages > 0 && previous.inboundMessages > 0
      ? formatPointChange(current.followUpRate, previous.followUpRate)
      : unmeasuredDelta();
  const averageDurationDelta =
    current.completedCount > 0 && previous.completedCount > 0
      ? formatMinuteChange(current.averageVisitLength, previous.averageVisitLength)
      : unmeasuredDelta();

  return {
    metrics: [
      {
        label: "Appointments",
        value: current.scheduledCount.toLocaleString("en-US"),
        delta: appointmentDelta.delta,
        trend: appointmentDelta.trend,
        helper: comparisonLabel,
      },
      {
        label: "Completion rate",
        value: current.finalizedCount > 0 ? formatPercent(current.completionRate) : "",
        delta: completionDelta.delta,
        trend: completionDelta.trend,
        helper: "Completed vs finalized visits",
      },
      {
        label: "Lost-slot rate",
        value: current.finalizedCount > 0 ? formatPercent(current.lostSlotRate) : "",
        delta: lostSlotDelta.delta,
        trend: lostSlotDelta.trend,
        helper: "Cancelled visit pressure",
      },
      {
        label: "Estimated utilization",
        value: formatPercent(current.utilizationRate),
        delta: utilizationDelta.delta,
        trend: utilizationDelta.trend,
        helper: "Booked minutes vs open hours × staff (estimate)",
      },
      {
        label: "New clients",
        value: current.newClients.toLocaleString("en-US"),
        delta: newClientsDelta.delta,
        trend: newClientsDelta.trend,
        helper: comparisonLabel,
      },
      {
        label: "Repeat-visit rate",
        value: current.completedCount > 0 ? formatPercent(current.repeatVisitRate) : "",
        delta: repeatVisitDelta.delta,
        trend: repeatVisitDelta.trend,
        helper: "Clients with multiple completed visits",
      },
      {
        label: "Follow-up coverage",
        value: current.inboundMessages > 0 ? formatPercent(current.followUpRate) : "",
        delta: followUpDelta.delta,
        trend: followUpDelta.trend,
        helper: "Outbound vs inbound messages",
      },
      {
        label: "Avg visit length",
        value: current.averageVisitLength > 0 ? `${current.averageVisitLength}m` : "",
        delta: averageDurationDelta.delta,
        trend: averageDurationDelta.trend,
        helper: comparisonLabel,
      },
    ],
    deltas: {
      appointments: appointmentDelta,
      completion: completionDelta,
      lostSlot: lostSlotDelta,
      utilization: utilizationDelta,
      clients: newClientsDelta,
      repeatVisit: repeatVisitDelta,
      followUp: followUpDelta,
      averageDuration: averageDurationDelta,
    },
  };
}

type ReportChartData = {
  points: ReportChartPoint[];
  completedValues: number[];
  newClientValues: number[];
};

type ReportClientRecord = Pick<Client, "createdAt" | "isArchived">;

function countClientsCreatedInRange(clients: ReportClientRecord[], start: Date, end: Date) {
  return clients.filter((client) => client.createdAt >= start && client.createdAt <= end).length;
}

function toChartData(
  buckets: Array<{ label: string; appointments: ReportAppointment[]; newClients: number }>
): ReportChartData {
  return {
    points: buckets.map((bucket) => ({
      label: bucket.label,
      value: bucket.appointments.length,
    })),
    completedValues: buckets.map(
      (bucket) =>
        bucket.appointments.filter((appointment) => appointment.status === "COMPLETED").length
    ),
    newClientValues: buckets.map((bucket) => bucket.newClients),
  };
}

function buildDailyChart(
  appointments: ReportAppointment[],
  clients: ReportClientRecord[],
  now: Date,
  timeZone: string
): ReportChartData {
  return toChartData(
    Array.from({ length: 7 }, (_, index) => {
      const dayWindow = getZonedDayWindowByOffset(now, index - 6, timeZone);

      return {
        label: formatZonedDayName(dayWindow.start, timeZone),
        appointments: filterAppointmentsInRange(appointments, dayWindow.start, dayWindow.end),
        newClients: countClientsCreatedInRange(clients, dayWindow.start, dayWindow.end),
      };
    })
  );
}

function buildWeeklyChart(
  appointments: ReportAppointment[],
  clients: ReportClientRecord[],
  now: Date,
  timeZone: string
): ReportChartData {
  const currentWeek = getZonedWeekWindow(now, timeZone);

  return toChartData(
    Array.from({ length: 8 }, (_, index) => {
      const startParts = addZonedDays(currentWeek.parts, (index - 7) * 7);
      const weekStart = getZonedDayWindowFromParts(
        startParts.year,
        startParts.month,
        startParts.day,
        timeZone
      ).start;
      const nextStartParts = addZonedDays(startParts, 7);
      const nextWeekStart = getZonedDayWindowFromParts(
        nextStartParts.year,
        nextStartParts.month,
        nextStartParts.day,
        timeZone
      ).start;
      const weekEnd = new Date(nextWeekStart.getTime() - 1);

      return {
        label: `W${index + 1}`,
        appointments: filterAppointmentsInRange(appointments, weekStart, weekEnd),
        newClients: countClientsCreatedInRange(clients, weekStart, weekEnd),
      };
    })
  );
}

function buildMonthlyChart(
  appointments: ReportAppointment[],
  clients: ReportClientRecord[],
  now: Date,
  timeZone: string
): ReportChartData {
  const currentMonth = getZonedMonthWindow(now, timeZone);

  return toChartData(
    Array.from({ length: 6 }, (_, index) => {
      const monthOffset = index - 5;
      const localMonthIndex = currentMonth.parts.month - 1 + monthOffset;
      const monthDate = new Date(Date.UTC(currentMonth.parts.year, localMonthIndex, 1));
      const monthStart = getZonedDayWindowFromParts(
        monthDate.getUTCFullYear(),
        monthDate.getUTCMonth() + 1,
        1,
        timeZone
      ).start;
      const nextMonthDate = new Date(
        Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1)
      );
      const nextMonthStart = getZonedDayWindowFromParts(
        nextMonthDate.getUTCFullYear(),
        nextMonthDate.getUTCMonth() + 1,
        1,
        timeZone
      ).start;
      const monthEnd = new Date(nextMonthStart.getTime() - 1);

      return {
        label: formatZonedMonthName(monthStart, timeZone),
        appointments: filterAppointmentsInRange(appointments, monthStart, monthEnd),
        newClients: countClientsCreatedInRange(clients, monthStart, monthEnd),
      };
    })
  );
}

function buildCustomChart(
  appointments: ReportAppointment[],
  clients: ReportClientRecord[],
  window: PeriodWindow,
  timeZone: string
): ReportChartData {
  const startParts = getZonedDateParts(window.start, timeZone);
  const endParts = getZonedDateParts(window.end, timeZone);
  const localStartDate = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const localEndDate = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  const dayCount = Math.max(Math.floor((localEndDate - localStartDate) / 86_400_000) + 1, 1);
  const step = Math.max(Math.ceil(dayCount / 12), 1);

  return toChartData(
    Array.from({ length: Math.ceil(dayCount / step) }, (_, index) => {
      const chunkStartParts = addZonedDays(startParts, index * step);
      const chunkEndParts = addZonedDays(startParts, Math.min((index + 1) * step, dayCount));
      const chunkStart = getZonedDayWindowFromParts(
        chunkStartParts.year,
        chunkStartParts.month,
        chunkStartParts.day,
        timeZone
      ).start;
      const chunkEnd = new Date(
        getZonedDayWindowFromParts(
          chunkEndParts.year,
          chunkEndParts.month,
          chunkEndParts.day,
          timeZone
        ).start.getTime() - 1
      );

      return {
        label:
          step === 1
            ? formatZonedShortDate(chunkStart, timeZone)
            : `${formatZonedShortDate(chunkStart, timeZone)}+`,
        appointments: filterAppointmentsInRange(appointments, chunkStart, chunkEnd),
        newClients: countClientsCreatedInRange(clients, chunkStart, chunkEnd),
      };
    })
  );
}

function buildKpis(args: {
  current: PeriodStats;
  deltas: ReturnType<typeof buildMetrics>["deltas"];
  diagnostics: ReportPeriodDiagnostics;
  comparisonLabel: string;
  clientMixTotal: number;
}): ReportKpi[] {
  const { current, deltas, diagnostics, comparisonLabel, clientMixTotal } = args;

  return [
    {
      key: "appointments",
      label: "Appointments",
      value: current.scheduledCount.toLocaleString("en-US"),
      delta: deltas.appointments.delta,
      trend: deltas.appointments.trend,
      helper: comparisonLabel,
    },
    {
      key: "completionRate",
      label: "Completion rate",
      value: current.finalizedCount > 0 ? formatPercent(current.completionRate) : "",
      delta: deltas.completion.delta,
      trend: deltas.completion.trend,
      helper: deltas.completion.delta ? comparisonLabel : "",
    },
    {
      key: "newClients",
      label: "New clients",
      value: current.newClients.toLocaleString("en-US"),
      delta: deltas.clients.delta,
      trend: deltas.clients.trend,
      helper: comparisonLabel,
    },
    {
      key: "avgVisitLength",
      label: "Avg visit length",
      value: current.averageVisitLength > 0 ? `${current.averageVisitLength}m` : "",
      delta: deltas.averageDuration.delta,
      trend: deltas.averageDuration.trend,
      helper: deltas.averageDuration.delta ? comparisonLabel : "",
    },
    {
      key: "activeClients",
      label: "Active clients",
      value: diagnostics.clientMix.active.toLocaleString("en-US"),
      delta: "",
      trend: "flat",
      helper:
        clientMixTotal > 0
          ? `of ${clientMixTotal.toLocaleString("en-US")} client records`
          : "",
    },
    {
      key: "unreadMessages",
      label: "Unread messages",
      value: current.unreadMessages.toLocaleString("en-US"),
      delta: "",
      trend: "flat",
      helper: current.unreadMessages > 0 ? "Open conversations" : "",
    },
  ];
}

function buildOperationalDetail(args: {
  current: PeriodStats;
  deltas: ReturnType<typeof buildMetrics>["deltas"];
  diagnostics: ReportPeriodDiagnostics;
}): ReportDetailRow[] {
  const { current, deltas, diagnostics } = args;
  const rows: ReportDetailRow[] = [
    {
      key: "utilization",
      label: "Estimated utilization",
      value: formatPercent(current.utilizationRate),
      delta: deltas.utilization.delta,
      trend: deltas.utilization.trend,
      helper: "Booked minutes vs open hours × staff (estimate)",
    },
  ];

  if (current.finalizedCount > 0) {
    rows.push({
      key: "lostSlot",
      label: "Lost-slot rate",
      value: formatPercent(current.lostSlotRate),
      delta: deltas.lostSlot.delta,
      trend: deltas.lostSlot.trend,
      helper: "",
    });
  }

  if (current.completedCount > 0) {
    rows.push({
      key: "repeatVisit",
      label: "Repeat-visit rate",
      value: formatPercent(current.repeatVisitRate),
      delta: deltas.repeatVisit.delta,
      trend: deltas.repeatVisit.trend,
      helper: "",
    });
  }

  if (current.inboundMessages > 0) {
    rows.push({
      key: "followUp",
      label: "Follow-up coverage",
      value: formatPercent(current.followUpRate),
      delta: deltas.followUp.delta,
      trend: deltas.followUp.trend,
      helper: "",
    });
  }

  rows.push({
    key: "sameDayBookings",
    label: "Same-day bookings",
    value: diagnostics.bookingBehavior.sameDayBookings.toLocaleString("en-US"),
    delta: "",
    trend: "flat",
    helper: "",
  });

  if (current.scheduledCount > 0) {
    rows.push({
      key: "leadTime",
      label: "Avg booking lead time",
      value: `${diagnostics.bookingBehavior.averageLeadTimeHours}h`,
      delta: "",
      trend: "flat",
      helper: "",
    });

    if (diagnostics.bookingBehavior.unassignedAppointments > 0) {
      rows.push({
        key: "unassigned",
        label: "Unassigned appointments",
        value: diagnostics.bookingBehavior.unassignedAppointments.toLocaleString("en-US"),
        delta: "",
        trend: "flat",
        helper: "",
      });
    }
  }

  return rows;
}

function buildClientMixSegments(
  clientMix: ReportPeriodDiagnostics["clientMix"]
): { total: number; segments: ReportClientMixSegment[] } {
  const total = clientMix.active + clientMix.atRisk + clientMix.inactive + clientMix.archived;
  const percentOf = (count: number) => (total > 0 ? (count / total) * 100 : 0);

  return {
    total,
    segments: [
      { key: "active", label: "Active", count: clientMix.active, percent: percentOf(clientMix.active) },
      { key: "atRisk", label: "At risk", count: clientMix.atRisk, percent: percentOf(clientMix.atRisk) },
      { key: "inactive", label: "Inactive", count: clientMix.inactive, percent: percentOf(clientMix.inactive) },
      { key: "archived", label: "Archived", count: clientMix.archived, percent: percentOf(clientMix.archived) },
    ],
  };
}

function buildPeriodView(args: {
  key: ReportPeriodKey;
  label: string;
  window: PeriodWindow;
  current: PeriodStats;
  previous: PeriodStats;
  diagnostics: ReportPeriodDiagnostics;
  chartData: ReportChartData;
  aiSnapshots: ReportAiSnapshotInput[];
  timeZone: string;
  aiSupported?: boolean;
}): ReportPeriodView {
  const {
    key,
    label,
    window,
    current,
    previous,
    diagnostics,
    chartData,
    aiSnapshots,
    timeZone,
    aiSupported = true,
  } = args;
  const comparisonLabel = formatComparisonLabel(key);
  const { metrics, deltas } = buildMetrics({
    current,
    previous,
    comparisonLabel,
  });
  const fallbackSnapshot = buildSnapshot(key, current, deltas);
  const matchedAiSnapshot = aiSnapshotForPeriod(aiSnapshots, key, window);
  const snapshot = aiSupported
    ? applyAiSnapshot(
        fallbackSnapshot,
        matchedAiSnapshot,
        isAiSnapshotFreshForView(matchedAiSnapshot, metrics, chartData.points, diagnostics)
      )
    : {
        ...fallbackSnapshot,
        statusLabel: "Rule-based analysis",
        auditLabel:
          "AI analysis covers daily, weekly, and monthly periods; custom ranges use rule-based analysis.",
      };
  const clientMixView = buildClientMixSegments(diagnostics.clientMix);

  return {
    key,
    label,
    rangeLabel: formatRangeLabel(window, key, timeZone),
    periodStart: window.start.toISOString(),
    periodEnd: window.end.toISOString(),
    periodStartKey: formatZonedDateKey(window.start, timeZone),
    periodEndKey: formatZonedDateKey(window.end, timeZone),
    comparisonLabel,
    highlightValue: `${snapshot.score}/100`,
    highlightChange:
      deltas.completion.trend === "flat" ? formatPercentShort(current.completionRate) : deltas.completion.delta,
    highlightTrend: deltas.completion.trend,
    highlightSummary: snapshot.summary,
    unreadMessages: current.unreadMessages,
    activeClients: diagnostics.clientMix.active,
    metrics,
    kpis: buildKpis({
      current,
      deltas,
      diagnostics,
      comparisonLabel,
      clientMixTotal: clientMixView.total,
    }),
    operationalDetail: buildOperationalDetail({ current, deltas, diagnostics }),
    statusTotal: diagnostics.statusMix.reduce((total, status) => total + status.count, 0),
    clientMixTotal: clientMixView.total,
    clientMixSegments: clientMixView.segments,
    diagnostics,
    chart: {
      title:
        key === "daily"
          ? "Appointments per day"
          : key === "weekly"
            ? "Appointments per week"
            : key === "custom"
              ? "Appointments in range"
              : "Appointments per month",
      periodLabel:
        key === "daily"
          ? "Last 7 days"
          : key === "weekly"
            ? "Last 8 weeks"
            : key === "custom"
              ? "Selected date range"
              : "Last 6 months",
      points: chartData.points,
      completedValues: chartData.completedValues,
      newClientValues: chartData.newClientValues,
      hasData: chartData.points.some((point) => point.value > 0),
    },
    snapshot,
  };
}

export function buildReportsViewFromWorkspace({
  business,
  appointments: appointmentsInput,
  clients,
  clientMix,
  messages,
  businessHours,
  scheduleBlocks,
  staffMembers,
  conversations,
  aiSnapshots = [],
  customRange,
  now = new Date(),
  timeZone = getAppTimeZone(),
}: ReportsWorkspaceArgs): ReportsViewModel {
  // Sort once by startAt so the many per-window / per-bucket range filters can
  // binary-search instead of re-scanning the whole array each time. Every
  // downstream consumer reads this sorted copy; results are order-independent.
  const appointments = [...appointmentsInput].sort(
    (left, right) => left.startAt.getTime() - right.startAt.getTime()
  );
  const activeStaffCount = staffMembers.filter(
    (member) => member.isActive && member.status !== "INACTIVE"
  ).length;
  const unreadMessages = conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0
  );

  const dailyCurrentWindow = getZonedDayWindowByOffset(now, 0, timeZone);
  const dailyPreviousWindow = getZonedDayWindowByOffset(now, -1, timeZone);
  const weeklyCurrentWindow = getZonedWeekWindow(now, timeZone);
  const previousWeekStartParts = addZonedDays(weeklyCurrentWindow.parts, -7);
  const previousWeekEndParts = addZonedDays(weeklyCurrentWindow.parts, 0);
  const weeklyPreviousWindow = {
    start: getZonedDayWindowFromParts(
      previousWeekStartParts.year,
      previousWeekStartParts.month,
      previousWeekStartParts.day,
      timeZone
    ).start,
    end: new Date(
      getZonedDayWindowFromParts(
        previousWeekEndParts.year,
        previousWeekEndParts.month,
        previousWeekEndParts.day,
        timeZone
      ).start.getTime() - 1
    ),
  };
  const monthlyCurrentWindow = getZonedMonthWindow(now, timeZone);
  const previousMonthDate = new Date(
    Date.UTC(monthlyCurrentWindow.parts.year, monthlyCurrentWindow.parts.month - 2, 1)
  );
  const monthlyPreviousStart = getZonedDayWindowFromParts(
    previousMonthDate.getUTCFullYear(),
    previousMonthDate.getUTCMonth() + 1,
    1,
    timeZone
  ).start;
  const monthlyPreviousEnd = new Date(monthlyCurrentWindow.start.getTime() - 1);
  const dailyWindow: PeriodWindow = {
    start: dailyCurrentWindow.start,
    end: dailyCurrentWindow.end,
    previousStart: dailyPreviousWindow.start,
    previousEnd: dailyPreviousWindow.end,
  };
  const weeklyWindow: PeriodWindow = {
    start: weeklyCurrentWindow.start,
    end: weeklyCurrentWindow.end,
    previousStart: weeklyPreviousWindow.start,
    previousEnd: weeklyPreviousWindow.end,
  };
  const monthlyWindow: PeriodWindow = {
    start: monthlyCurrentWindow.start,
    end: monthlyCurrentWindow.end,
    previousStart: monthlyPreviousStart,
    previousEnd: monthlyPreviousEnd,
  };
  const customWindow: PeriodWindow | undefined = customRange
    ? {
        start: customRange.start,
        end: customRange.end,
        previousStart: new Date(
          customRange.start.getTime() -
            Math.max(customRange.end.getTime() - customRange.start.getTime(), 86_400_000) -
            1
        ),
        previousEnd: new Date(customRange.start.getTime() - 1),
      }
    : undefined;

  const dailyCurrent = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    scheduleBlocks,
    activeStaffCount,
    unreadMessages,
    window: dailyWindow,
    timeZone,
  });
  const dailyDiagnostics = buildPeriodDiagnostics({
    appointments,
    clientMix,
    staffMembers,
    window: dailyWindow,
    timeZone,
  });
  const dailyPrevious = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    scheduleBlocks,
    activeStaffCount,
    unreadMessages,
    window: {
      start: dailyWindow.previousStart,
      end: dailyWindow.previousEnd,
      previousStart: dailyWindow.previousStart,
      previousEnd: dailyWindow.previousEnd,
    },
    timeZone,
  });

  const weeklyCurrent = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    scheduleBlocks,
    activeStaffCount,
    unreadMessages,
    window: weeklyWindow,
    timeZone,
  });
  const weeklyDiagnostics = buildPeriodDiagnostics({
    appointments,
    clientMix,
    staffMembers,
    window: weeklyWindow,
    timeZone,
  });
  const weeklyPrevious = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    scheduleBlocks,
    activeStaffCount,
    unreadMessages,
    window: {
      start: weeklyWindow.previousStart,
      end: weeklyWindow.previousEnd,
      previousStart: weeklyWindow.previousStart,
      previousEnd: weeklyWindow.previousEnd,
    },
    timeZone,
  });

  const monthlyCurrent = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    scheduleBlocks,
    activeStaffCount,
    unreadMessages,
    window: monthlyWindow,
    timeZone,
  });
  const monthlyDiagnostics = buildPeriodDiagnostics({
    appointments,
    clientMix,
    staffMembers,
    window: monthlyWindow,
    timeZone,
  });
  const monthlyPrevious = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    scheduleBlocks,
    activeStaffCount,
    unreadMessages,
    window: {
      start: monthlyWindow.previousStart,
      end: monthlyWindow.previousEnd,
      previousStart: monthlyWindow.previousStart,
      previousEnd: monthlyWindow.previousEnd,
    },
    timeZone,
  });
  const customCurrent = customWindow
    ? buildPeriodStats({
        appointments,
        clients,
        messages,
        businessHours,
        scheduleBlocks,
        activeStaffCount,
        unreadMessages,
        window: customWindow,
        timeZone,
      })
    : weeklyCurrent;
  const customDiagnostics = customWindow
    ? buildPeriodDiagnostics({
        appointments,
        clientMix,
        staffMembers,
        window: customWindow,
        timeZone,
      })
    : weeklyDiagnostics;
  const customPrevious = customWindow
    ? buildPeriodStats({
        appointments,
        clients,
        messages,
        businessHours,
        scheduleBlocks,
        activeStaffCount,
        unreadMessages,
        window: {
          start: customWindow.previousStart,
          end: customWindow.previousEnd,
          previousStart: customWindow.previousStart,
          previousEnd: customWindow.previousEnd,
        },
        timeZone,
      })
    : weeklyPrevious;
  const customPeriod = buildPeriodView({
    key: "custom",
    label: "Custom range",
    window: customWindow ?? weeklyWindow,
    current: customCurrent,
    previous: customPrevious,
    diagnostics: customDiagnostics,
    chartData: customWindow
      ? buildCustomChart(appointments, clients, customWindow, timeZone)
      : buildWeeklyChart(appointments, clients, now, timeZone),
    aiSnapshots: [],
    timeZone,
    aiSupported: false,
  });

  return {
    heading: "Performance analytics",
    description: `${business.name} is now scored across demand, schedule quality, retention, and follow-up so the clinic can see what is healthy, what is leaking, and where the next operational improvement should happen.`,
    defaultPeriod: customRange ? "custom" : "weekly",
    periodOrder: customRange ? [...periodOrder, "custom"] : periodOrder,
    periods: {
      daily: buildPeriodView({
        key: "daily",
        label: "Today",
        window: dailyWindow,
        current: dailyCurrent,
        previous: dailyPrevious,
        diagnostics: dailyDiagnostics,
        chartData: buildDailyChart(appointments, clients, now, timeZone),
        aiSnapshots,
        timeZone,
      }),
      weekly: buildPeriodView({
        key: "weekly",
        label: "This week",
        window: weeklyWindow,
        current: weeklyCurrent,
        previous: weeklyPrevious,
        diagnostics: weeklyDiagnostics,
        chartData: buildWeeklyChart(appointments, clients, now, timeZone),
        aiSnapshots,
        timeZone,
      }),
      monthly: buildPeriodView({
        key: "monthly",
        label: "This month",
        window: monthlyWindow,
        current: monthlyCurrent,
        previous: monthlyPrevious,
        diagnostics: monthlyDiagnostics,
        chartData: buildMonthlyChart(appointments, clients, now, timeZone),
        aiSnapshots,
        timeZone,
      }),
      custom: customPeriod,
    },
  };
}
