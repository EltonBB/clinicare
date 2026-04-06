import {
  endOfDay,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
  subDays,
  subWeeks,
} from "date-fns";
import type { Appointment, Business, Client, Message } from "@prisma/client";

export type ReportMetricTrend = "up" | "down" | "flat";

export type ReportMetric = {
  label: string;
  value: string;
  delta: string;
  trend: ReportMetricTrend;
};

export type ReportChartPoint = {
  label: string;
  value: number;
};

export type ReportsViewModel = {
  heading: string;
  description: string;
  metrics: ReportMetric[];
  chart: {
    title: string;
    periodLabel: string;
    points: ReportChartPoint[];
  };
  snapshot: {
    topSignal: string;
    watch: string;
    focus: string;
  };
};

type ReportsWorkspaceArgs = {
  business: Pick<Business, "name">;
  appointments: Array<Pick<Appointment, "status" | "startAt">>;
  clients: Array<Pick<Client, "createdAt" | "status" | "isArchived">>;
  messages: Array<Pick<Message, "direction" | "sentAt">>;
};

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
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

function countAppointmentsBetween(
  appointments: Array<Pick<Appointment, "startAt">>,
  start: Date,
  end: Date
) {
  return appointments.filter(
    (appointment) => appointment.startAt >= start && appointment.startAt <= end
  ).length;
}

function countClientsBetween(
  clients: Array<Pick<Client, "createdAt" | "isArchived">>,
  start: Date,
  end: Date
) {
  return clients.filter(
    (client) =>
      !client.isArchived && client.createdAt >= start && client.createdAt <= end
  ).length;
}

function countOutboundMessagesBetween(
  messages: Array<Pick<Message, "direction" | "sentAt">>,
  start: Date,
  end: Date
) {
  return messages.filter(
    (message) =>
      message.direction === "OUTBOUND" &&
      message.sentAt >= start &&
      message.sentAt <= end
  ).length;
}

function noShowRateBetween(
  appointments: Array<Pick<Appointment, "status" | "startAt">>,
  start: Date,
  end: Date
) {
  const scoped = appointments.filter(
    (appointment) => appointment.startAt >= start && appointment.startAt <= end
  );

  if (scoped.length === 0) {
    return 0;
  }

  const cancelled = scoped.filter(
    (appointment) => appointment.status === "CANCELLED"
  ).length;

  return (cancelled / scoped.length) * 100;
}

function buildSnapshot(args: {
  appointmentTrend: ReportMetricTrend;
  appointmentDelta: string;
  noShowRate: number;
  newClients: number;
  unreadlessMessages: number;
}) {
  const { appointmentTrend, appointmentDelta, noShowRate, newClients, unreadlessMessages } =
    args;

  const topSignal =
    appointmentTrend === "up"
      ? `Appointments are trending up (${appointmentDelta}) while the clinic is still keeping weekly activity compact and manageable.`
      : appointmentTrend === "down"
        ? `Appointments are trending down (${appointmentDelta}), so the calendar should be watched for recoverable gaps this week.`
        : "Appointments are stable week over week, which gives a clean baseline for the next round of growth.";

  const watch =
    noShowRate > 8
      ? `The no-show proxy is elevated at ${formatPercent(noShowRate)}. Tight reminders and faster inbox follow-up should be the first response.`
      : `The no-show proxy is sitting at ${formatPercent(noShowRate)}, which is healthy for an early operating workflow.`;

  const focus =
    newClients > 0
      ? `New client flow is active with ${newClients} recent additions and ${unreadlessMessages} outbound messages sent in the same window. Keep response speed high and the booking path simple.`
      : `New client volume is still quiet, so use the inbox and reminders to protect retention while the clinic builds repeat demand.`;

  return {
    topSignal,
    watch,
    focus,
  };
}

export function buildReportsViewFromWorkspace({
  business,
  appointments,
  clients,
  messages,
}: ReportsWorkspaceArgs): ReportsViewModel {
  const now = new Date();
  const currentWindowStart = startOfDay(subDays(now, 29));
  const previousWindowStart = startOfDay(subDays(now, 59));
  const previousWindowEnd = endOfDay(subDays(now, 30));

  const totalAppointments = appointments.length;
  const totalAppointmentsPrevious = countAppointmentsBetween(
    appointments,
    previousWindowStart,
    previousWindowEnd
  );
  const totalAppointmentsCurrent = countAppointmentsBetween(
    appointments,
    currentWindowStart,
    endOfDay(now)
  );
  const appointmentDelta = formatDelta(
    totalAppointmentsCurrent,
    totalAppointmentsPrevious
  );

  const noShowRateCurrent = noShowRateBetween(
    appointments,
    currentWindowStart,
    endOfDay(now)
  );
  const noShowRatePrevious = noShowRateBetween(
    appointments,
    previousWindowStart,
    previousWindowEnd
  );
  const noShowDelta = formatDelta(noShowRateCurrent, noShowRatePrevious, {
    inverse: true,
  });

  const newClientsCurrent = countClientsBetween(
    clients,
    currentWindowStart,
    endOfDay(now)
  );
  const newClientsPrevious = countClientsBetween(
    clients,
    previousWindowStart,
    previousWindowEnd
  );
  const newClientsDelta = formatDelta(newClientsCurrent, newClientsPrevious);

  const messagesSentCurrent = countOutboundMessagesBetween(
    messages,
    currentWindowStart,
    endOfDay(now)
  );
  const messagesSentPrevious = countOutboundMessagesBetween(
    messages,
    previousWindowStart,
    previousWindowEnd
  );
  const messagesDelta = formatDelta(messagesSentCurrent, messagesSentPrevious);

  const chartPoints = Array.from({ length: 6 }, (_, index) => {
    const weekStart = startOfWeek(subWeeks(now, 5 - index), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

    return {
      label: format(weekStart, "'W'II"),
      value: countAppointmentsBetween(appointments, weekStart, weekEnd),
    };
  });

  return {
    heading: "Overview",
    description: `${business.name} performance at a glance with the essential operational numbers the team needs each week.`,
    metrics: [
      {
        label: "Total appointments",
        value: totalAppointments.toLocaleString("en-US"),
        delta: appointmentDelta.delta,
        trend: appointmentDelta.trend,
      },
      {
        label: "No-show rate",
        value: formatPercent(noShowRateCurrent),
        delta: noShowDelta.delta,
        trend: noShowDelta.trend,
      },
      {
        label: "New clients",
        value: newClientsCurrent.toLocaleString("en-US"),
        delta: newClientsDelta.delta,
        trend: newClientsDelta.trend,
      },
      {
        label: "Messages sent",
        value: messagesSentCurrent.toLocaleString("en-US"),
        delta: messagesDelta.delta,
        trend: messagesDelta.trend,
      },
    ],
    chart: {
      title: "Appointments per week",
      periodLabel: "Last 6 weeks",
      points: chartPoints,
    },
    snapshot: buildSnapshot({
      appointmentTrend: appointmentDelta.trend,
      appointmentDelta: appointmentDelta.delta,
      noShowRate: noShowRateCurrent,
      newClients: newClientsCurrent,
      unreadlessMessages: messagesSentCurrent,
    }),
  };
}
