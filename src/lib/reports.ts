import {
  addMilliseconds,
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import type {
  Appointment,
  Business,
  BusinessHours,
  Client,
  Conversation,
  Message,
  StaffMember,
} from "@prisma/client";

export type ReportMetricTrend = "up" | "down" | "flat";
export type ReportSnapshotTone = "strong" | "healthy" | "watch" | "attention";
export type ReportPeriodKey = "daily" | "weekly" | "monthly";

export type ReportMetric = {
  label: string;
  value: string;
  delta: string;
  trend: ReportMetricTrend;
  helper: string;
};

export type ReportChartPoint = {
  label: string;
  value: number;
};

export type ReportSnapshot = {
  score: number;
  tone: ReportSnapshotTone;
  headline: string;
  summary: string;
  strength: string;
  watch: string;
  focus: string;
};

export type ReportPeriodView = {
  key: ReportPeriodKey;
  label: string;
  rangeLabel: string;
  comparisonLabel: string;
  highlightValue: string;
  highlightChange: string;
  highlightTrend: ReportMetricTrend;
  highlightSummary: string;
  metrics: ReportMetric[];
  chart: {
    title: string;
    periodLabel: string;
    points: ReportChartPoint[];
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
  "status" | "startAt" | "endAt" | "clientId"
>;

type ReportsWorkspaceArgs = {
  business: Pick<Business, "name">;
  appointments: ReportAppointment[];
  clients: Array<Pick<Client, "createdAt" | "status" | "isArchived">>;
  messages: Array<Pick<Message, "direction" | "sentAt">>;
  businessHours: Array<Pick<BusinessHours, "weekday" | "isOpen" | "startTime" | "endTime">>;
  staffMembers: Array<Pick<StaffMember, "status" | "isActive">>;
  conversations: Array<Pick<Conversation, "unreadCount">>;
};

type PeriodWindow = {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
};

type PeriodStats = {
  scheduledCount: number;
  completedCount: number;
  cancelledCount: number;
  completionRate: number;
  lostSlotRate: number;
  utilizationRate: number;
  newClients: number;
  repeatVisitRate: number;
  outboundMessages: number;
  inboundMessages: number;
  followUpRate: number;
  averageVisitLength: number;
  unreadMessages: number;
};

const periodOrder: ReportPeriodKey[] = ["daily", "weekly", "monthly"];

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatPercentShort(value: number) {
  return `${value.toFixed(0)}%`;
}

function formatDelta(
  current: number,
  previous: number,
  options?: {
    inverse?: boolean;
    suffix?: string;
  }
): { delta: string; trend: ReportMetricTrend } {
  const safePrevious = previous === 0 ? 0 : ((current - previous) / previous) * 100;
  const rawDelta = previous === 0 ? (current === 0 ? 0 : 100) : safePrevious;
  const normalized = Number.isFinite(rawDelta) ? rawDelta : 0;
  const absolute = Math.abs(normalized).toFixed(1).replace(/\.0$/, "");
  const delta = `${normalized >= 0 ? "+" : "-"}${absolute}${options?.suffix ?? "%"}`;

  if (Math.abs(normalized) < 0.1) {
    return {
      delta: options?.suffix === "%" ? "0%" : "0",
      trend: "flat",
    };
  }

  const positive = normalized > 0;
  const trend = options?.inverse
    ? positive
      ? "down"
      : "up"
    : positive
      ? "up"
      : "down";

  return { delta, trend };
}

function compareSameLengthWindow(start: Date, end: Date): PeriodWindow {
  const durationMs = Math.max(end.getTime() - start.getTime(), 1);
  const previousEnd = addMilliseconds(start, -1);
  const previousStart = addMilliseconds(previousEnd, -durationMs);

  return {
    start,
    end,
    previousStart,
    previousEnd,
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

  return "vs last month";
}

function formatRangeLabel(window: PeriodWindow, period: ReportPeriodKey) {
  if (period === "daily") {
    return format(window.start, "EEE, MMM d");
  }

  if (period === "weekly") {
    return `${format(window.start, "MMM d")} - ${format(window.end, "MMM d")}`;
  }

  return format(window.start, "MMMM yyyy");
}

function isBookedStatus(status: Appointment["status"]) {
  return status !== "CANCELLED";
}

function countDistinct<T>(values: T[]) {
  return new Set(values).size;
}

function filterAppointmentsInRange(
  appointments: ReportAppointment[],
  start: Date,
  end: Date
) {
  return appointments.filter((appointment) =>
    isWithinInterval(appointment.startAt, { start, end })
  );
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
  activeStaffCount: number
) {
  const safeStaffCount = Math.max(activeStaffCount, 1);
  const windowEndDay = startOfDay(window.end).getTime();
  const endMinutes = window.end.getHours() * 60 + window.end.getMinutes();

  return eachDayOfInterval({ start: startOfDay(window.start), end: startOfDay(window.end) }).reduce(
    (total, day) => {
      const weekday = (day.getDay() + 6) % 7;
      const schedule = businessHours.find((item) => item.weekday === weekday);

      if (!schedule?.isOpen) {
        return total;
      }

      const dayStartMinutes = parseTimeToMinutes(schedule.startTime);
      const dayEndMinutes =
        startOfDay(day).getTime() === windowEndDay
          ? Math.min(parseTimeToMinutes(schedule.endTime), endMinutes)
          : parseTimeToMinutes(schedule.endTime);
      const minutes = Math.max(
        dayEndMinutes - dayStartMinutes,
        0
      );

      return total + minutes * safeStaffCount;
    },
    0
  );
}

function buildPeriodStats(args: {
  appointments: ReportAppointment[];
  clients: Array<Pick<Client, "createdAt" | "status" | "isArchived">>;
  messages: Array<Pick<Message, "direction" | "sentAt">>;
  businessHours: Array<Pick<BusinessHours, "weekday" | "isOpen" | "startTime" | "endTime">>;
  activeStaffCount: number;
  unreadMessages: number;
  window: PeriodWindow;
}): PeriodStats {
  const { appointments, clients, messages, businessHours, activeStaffCount, unreadMessages, window } =
    args;
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
  const capacityMinutes = buildCapacityMinutes(window, businessHours, activeStaffCount);
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
    completedCount: completedAppointments.length,
    cancelledCount: cancelledAppointments.length,
    completionRate:
      finalizedAppointments.length > 0
        ? (completedAppointments.length / finalizedAppointments.length) * 100
        : 0,
    lostSlotRate:
      finalizedAppointments.length > 0
        ? (cancelledAppointments.length / finalizedAppointments.length) * 100
        : 0,
    utilizationRate:
      capacityMinutes > 0 ? Math.min((bookedMinutes / capacityMinutes) * 100, 999) : 0,
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

function scorePeriod(stats: PeriodStats) {
  let score = 100;

  if (stats.completionRate < 90) score -= 15;
  if (stats.completionRate < 80) score -= 10;
  if (stats.lostSlotRate > 8) score -= 15;
  if (stats.lostSlotRate > 15) score -= 10;
  if (stats.utilizationRate < 55) score -= 12;
  if (stats.utilizationRate > 95) score -= 8;
  if (stats.repeatVisitRate < 25) score -= 10;
  if (stats.inboundMessages > 0 && stats.followUpRate < 50) score -= 10;
  if (stats.unreadMessages > 5) score -= 8;

  return Math.max(20, Math.min(Math.round(score), 100));
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
    period === "daily" ? "today" : period === "weekly" ? "this week" : "this month";

  const headline =
    tone === "strong"
      ? `Clinic performance is strong ${periodLabel}.`
      : tone === "healthy"
        ? `Clinic performance is healthy ${periodLabel}.`
        : tone === "watch"
          ? `Clinic performance needs watching ${periodLabel}.`
          : `Clinic performance needs attention ${periodLabel}.`;

  const summary =
    deltas.appointments.trend === "up"
      ? `Booked activity is moving up ${deltas.appointments.delta} while completion is at ${formatPercent(
          stats.completionRate
        )}.`
      : deltas.appointments.trend === "down"
        ? `Booked activity is softer ${deltas.appointments.delta}, so demand and retention should be watched closely.`
        : `Booked activity is steady, giving a clear baseline to improve operational discipline.`;

  const strength =
    stats.completionRate >= 90 && stats.lostSlotRate <= 8
      ? `Visit execution is reliable: ${formatPercent(stats.completionRate)} completed with only ${formatPercent(
          stats.lostSlotRate
        )} lost slots.`
      : stats.utilizationRate >= 70 && stats.utilizationRate <= 92
        ? `Capacity is being used well at ${formatPercent(stats.utilizationRate)} schedule utilization, which is a healthy operating range.`
        : stats.newClients > 0
          ? `${stats.newClients} new clients entered the clinic ${periodLabel}, which keeps acquisition moving.`
          : `The clinic kept a stable operating rhythm ${periodLabel}, which is useful for controlled improvement.`;

  const watch =
    stats.lostSlotRate > 10
      ? `Lost-slot pressure is high at ${formatPercent(stats.lostSlotRate)}. Missed or cancelled visits are the clearest source of preventable leakage.`
      : stats.utilizationRate < 55
        ? `Schedule utilization is only ${formatPercent(stats.utilizationRate)}. Open hours are not turning into enough booked care time.`
        : stats.utilizationRate > 95
          ? `Schedule utilization is ${formatPercent(stats.utilizationRate)}, which risks overload and weaker patient experience.`
          : stats.repeatVisitRate < 25
            ? `Repeat-visit rate is ${formatPercent(stats.repeatVisitRate)}. The clinic is not yet pulling enough return demand from recent patients.`
            : stats.inboundMessages > 0 && stats.followUpRate < 50
              ? `Only ${formatPercent(stats.followUpRate)} of inbound message volume is matched by outbound follow-up. Response discipline is still weak.`
              : `No single operational risk dominates right now, so the focus can stay on compounding good scheduling habits.`;

  const focus =
    stats.lostSlotRate > 10
      ? "Tighten reminders, confirm uncertain appointments earlier, and use the inbox for same-day recovery when a slot is at risk."
      : stats.utilizationRate < 55 && stats.newClients === 0
        ? "Push reactivation: bring back older clients, reduce empty hours, and make the next available appointment easier to book."
        : stats.utilizationRate < 55
          ? "Keep acquisition active, but turn more demand into attended visits by reducing no-shows and simplifying rescheduling."
          : stats.utilizationRate > 95
            ? "Protect quality by adding staff coverage, extending open hours, or creating more buffer between visits."
            : stats.repeatVisitRate < 25
              ? "Focus on retention: follow up after completed visits and create a clearer path to the next appointment before the client leaves."
              : stats.inboundMessages > 0 && stats.followUpRate < 50
                ? "Improve inbox handling. Faster replies and more outbound follow-up should convert more conversations into booked care."
                : "Keep reinforcing what works: preserve completion quality, hold cancellations down, and monitor whether growth stays manageable.";

  return {
    score,
    tone,
    headline,
    summary,
    strength,
    watch,
    focus,
  };
}

function buildMetrics(args: {
  current: PeriodStats;
  previous: PeriodStats;
  comparisonLabel: string;
}) {
  const { current, previous, comparisonLabel } = args;
  const appointmentDelta = formatDelta(current.scheduledCount, previous.scheduledCount);
  const completionDelta = formatDelta(current.completionRate, previous.completionRate);
  const lostSlotDelta = formatDelta(current.lostSlotRate, previous.lostSlotRate, {
    inverse: true,
  });
  const utilizationDelta = formatDelta(current.utilizationRate, previous.utilizationRate);
  const newClientsDelta = formatDelta(current.newClients, previous.newClients);
  const repeatVisitDelta = formatDelta(current.repeatVisitRate, previous.repeatVisitRate);
  const followUpDelta = formatDelta(current.followUpRate, previous.followUpRate);
  const averageDurationDelta = formatDelta(
    current.averageVisitLength,
    previous.averageVisitLength,
    { suffix: "%" }
  );

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
        value: formatPercent(current.completionRate),
        delta: completionDelta.delta,
        trend: completionDelta.trend,
        helper: comparisonLabel,
      },
      {
        label: "Lost-slot rate",
        value: formatPercent(current.lostSlotRate),
        delta: lostSlotDelta.delta,
        trend: lostSlotDelta.trend,
        helper: "Cancelled visit pressure",
      },
      {
        label: "Schedule utilization",
        value: formatPercent(current.utilizationRate),
        delta: utilizationDelta.delta,
        trend: utilizationDelta.trend,
        helper: "Booked minutes vs open capacity",
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
        value: formatPercent(current.repeatVisitRate),
        delta: repeatVisitDelta.delta,
        trend: repeatVisitDelta.trend,
        helper: "Clients with multiple completed visits",
      },
      {
        label: "Follow-up coverage",
        value: current.inboundMessages > 0 ? formatPercent(current.followUpRate) : "—",
        delta: followUpDelta.delta,
        trend: followUpDelta.trend,
        helper: "Outbound vs inbound messages",
      },
      {
        label: "Avg visit length",
        value: current.averageVisitLength > 0 ? `${current.averageVisitLength}m` : "—",
        delta: averageDurationDelta.delta,
        trend: averageDurationDelta.trend,
        helper: `${current.unreadMessages} unread message${current.unreadMessages === 1 ? "" : "s"}`,
      },
    ],
    deltas: {
      appointments: appointmentDelta,
      completion: completionDelta,
      utilization: utilizationDelta,
      clients: newClientsDelta,
    },
  };
}

function buildDailyChart(appointments: ReportAppointment[]): ReportChartPoint[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = startOfDay(subDays(new Date(), 6 - index));
    const dayEnd = endOfDay(day);

    return {
      label: format(day, "EEE"),
      value: filterAppointmentsInRange(appointments, day, dayEnd).length,
    };
  });
}

function buildWeeklyChart(appointments: ReportAppointment[]): ReportChartPoint[] {
  return Array.from({ length: 8 }, (_, index) => {
    const weekStart = startOfWeek(subWeeks(new Date(), 7 - index), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

    return {
      label: format(weekStart, "'W'II"),
      value: filterAppointmentsInRange(appointments, weekStart, weekEnd).length,
    };
  });
}

function buildMonthlyChart(appointments: ReportAppointment[]): ReportChartPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const monthStart = startOfMonth(subMonths(new Date(), 5 - index));
    const monthEnd = endOfMonth(monthStart);

    return {
      label: format(monthStart, "MMM"),
      value: filterAppointmentsInRange(appointments, monthStart, monthEnd).length,
    };
  });
}

function buildPeriodView(args: {
  key: ReportPeriodKey;
  label: string;
  window: PeriodWindow;
  current: PeriodStats;
  previous: PeriodStats;
  chartPoints: ReportChartPoint[];
}): ReportPeriodView {
  const { key, label, window, current, previous, chartPoints } = args;
  const comparisonLabel = formatComparisonLabel(key);
  const { metrics, deltas } = buildMetrics({
    current,
    previous,
    comparisonLabel,
  });
  const snapshot = buildSnapshot(key, current, deltas);

  return {
    key,
    label,
    rangeLabel: formatRangeLabel(window, key),
    comparisonLabel,
    highlightValue: `${snapshot.score}/100`,
    highlightChange:
      deltas.completion.trend === "flat" ? formatPercentShort(current.completionRate) : deltas.completion.delta,
    highlightTrend: deltas.completion.trend,
    highlightSummary: snapshot.summary,
    metrics,
    chart: {
      title:
        key === "daily"
          ? "Appointments per day"
          : key === "weekly"
            ? "Appointments per week"
            : "Appointments per month",
      periodLabel:
        key === "daily"
          ? "Last 7 days"
          : key === "weekly"
            ? "Last 8 weeks"
            : "Last 6 months",
      points: chartPoints,
    },
    snapshot,
  };
}

export function buildReportsViewFromWorkspace({
  business,
  appointments,
  clients,
  messages,
  businessHours,
  staffMembers,
  conversations,
}: ReportsWorkspaceArgs): ReportsViewModel {
  const now = new Date();
  const activeStaffCount = staffMembers.filter(
    (member) => member.isActive && member.status !== "INACTIVE"
  ).length;
  const unreadMessages = conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0
  );

  const dailyWindow = compareSameLengthWindow(startOfDay(now), now);
  const weeklyWindow = compareSameLengthWindow(startOfWeek(now, { weekStartsOn: 1 }), now);
  const monthlyWindow = compareSameLengthWindow(startOfMonth(now), now);

  const dailyCurrent = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    activeStaffCount,
    unreadMessages,
    window: dailyWindow,
  });
  const dailyPrevious = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    activeStaffCount,
    unreadMessages,
    window: {
      start: dailyWindow.previousStart,
      end: dailyWindow.previousEnd,
      previousStart: dailyWindow.previousStart,
      previousEnd: dailyWindow.previousEnd,
    },
  });

  const weeklyCurrent = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    activeStaffCount,
    unreadMessages,
    window: weeklyWindow,
  });
  const weeklyPrevious = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    activeStaffCount,
    unreadMessages,
    window: {
      start: weeklyWindow.previousStart,
      end: weeklyWindow.previousEnd,
      previousStart: weeklyWindow.previousStart,
      previousEnd: weeklyWindow.previousEnd,
    },
  });

  const monthlyCurrent = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    activeStaffCount,
    unreadMessages,
    window: monthlyWindow,
  });
  const monthlyPrevious = buildPeriodStats({
    appointments,
    clients,
    messages,
    businessHours,
    activeStaffCount,
    unreadMessages,
    window: {
      start: monthlyWindow.previousStart,
      end: monthlyWindow.previousEnd,
      previousStart: monthlyWindow.previousStart,
      previousEnd: monthlyWindow.previousEnd,
    },
  });

  return {
    heading: "Performance analytics",
    description: `${business.name} is now scored across demand, schedule quality, retention, and follow-up so the clinic can see what is healthy, what is leaking, and where the next operational improvement should happen.`,
    defaultPeriod: "weekly",
    periodOrder,
    periods: {
      daily: buildPeriodView({
        key: "daily",
        label: "Today",
        window: dailyWindow,
        current: dailyCurrent,
        previous: dailyPrevious,
        chartPoints: buildDailyChart(appointments),
      }),
      weekly: buildPeriodView({
        key: "weekly",
        label: "This week",
        window: weeklyWindow,
        current: weeklyCurrent,
        previous: weeklyPrevious,
        chartPoints: buildWeeklyChart(appointments),
      }),
      monthly: buildPeriodView({
        key: "monthly",
        label: "This month",
        window: monthlyWindow,
        current: monthlyCurrent,
        previous: monthlyPrevious,
        chartPoints: buildMonthlyChart(appointments),
      }),
    },
  };
}
