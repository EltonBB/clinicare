import { differenceInMinutes, subDays } from "date-fns";
import type { Appointment, Business, Client } from "@prisma/client";
import { isProBusinessPlan, planDisplayName, planStatusLabel } from "@/lib/billing";
import {
  formatZonedDateKey,
  formatZonedLongDate,
  formatZonedShortDate,
  formatZonedShortDateTime,
  formatZonedTime,
  getAppTimeZone,
} from "@/lib/time-zone";

export type DashboardAppointmentStatus = "confirmed" | "pending" | "cancelled" | "completed";

export type DashboardAppointment = {
  id: string;
  time: string;
  startAtIso: string;
  durationMinutes: number;
  clientName: string;
  service: string;
  staffName: string;
  status: DashboardAppointmentStatus;
};

export type DashboardQuickAction = {
  label: string;
  href: string;
  tone: "primary" | "secondary";
};

export type DashboardMessageSummary = {
  unreadCount: number;
  title: string;
  description: string;
};

export type DashboardPlanSummary = {
  planName: string;
  statusLabel: string;
  isPro: boolean;
};

export type DashboardAnalyticsSummary = {
  todaysAppointments: number;
  completedThisMonth: number;
  completionRate: number;
  activeClients: number;
  unreadMessages: number;
  averageDurationMinutes: number;
};

export type DashboardTrendTone = "up" | "down" | "neutral";

export type DashboardVisitsDay = {
  key: string;
  label: string;
  count: number;
  isToday: boolean;
};

export type DashboardVisitsSummary = {
  days: DashboardVisitsDay[];
  lastSevenDays: number;
  previousSevenDays: number;
  deltaLabel: string | null;
  deltaTone: DashboardTrendTone;
  lastThirtyDays: number;
  allTime: number;
};

export type DashboardRevenueSummary = {
  monthToDateDisplay: string;
  paidCountThisMonth: number;
  outstandingDisplay: string;
  hasOutstanding: boolean;
  hasPayments: boolean;
};

export type DashboardConversationPreview = {
  id: string;
  contactName: string;
  snippet: string;
  timeLabel: string;
  unreadCount: number;
};

export type DashboardStaffToday = {
  id: string;
  name: string;
  role: string;
  appointmentsToday: number;
};

export type DashboardWorkspaceState = {
  clientCount: number;
  appointmentCount: number;
  recentClientId?: string;
  scheduleState: "no-clients" | "no-appointments" | "no-today" | "active";
};

export type DashboardClientSummary = {
  id: string;
  name: string;
  phone: string | null;
  updatedLabel: string;
};

export type DashboardViewModel = {
  businessName: string;
  heading: string;
  dateLabel: string;
  appointments: DashboardAppointment[];
  lastClients: DashboardClientSummary[];
  nextAppointment: DashboardAppointment | null;
  quickActions: DashboardQuickAction[];
  unreadSummary: DashboardMessageSummary;
  planSummary: DashboardPlanSummary;
  analyticsSummary: DashboardAnalyticsSummary;
  visitsSummary: DashboardVisitsSummary;
  revenueSummary: DashboardRevenueSummary;
  conversationPreviews: DashboardConversationPreview[];
  staffToday: DashboardStaffToday[];
  workspaceState: DashboardWorkspaceState;
};

export type DashboardPaymentRow = {
  amountCents: number;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
};

export type DashboardConversationRow = {
  id: string;
  contactName: string;
  unreadCount: number;
  updatedAt: Date;
  messages: Array<{ body: string; sentAt: Date }>;
};

export type DashboardStaffRow = {
  id: string;
  name: string;
  role: string;
};

type TodayAppointmentWithRelations = Appointment & {
  client: {
    name: string;
  };
  staffMember: {
    name: string;
  } | null;
};

type ClientSummaryRow = Pick<Client, "id" | "name" | "phone" | "updatedAt">;

function formatUpdatedLabel(date: Date, now: Date, timeZone: string) {
  const minutes = Math.max(Math.floor((now.getTime() - date.getTime()) / 60000), 0);

  if (minutes < 1) {
    return "Updated just now";
  }

  if (minutes < 60) {
    return `Updated ${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `Updated ${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days === 1) {
    return "Updated yesterday";
  }

  if (days < 7) {
    return `Updated ${days}d ago`;
  }

  return `Updated ${formatZonedShortDate(date, timeZone)}`;
}

function toDashboardStatus(status: Appointment["status"]): DashboardAppointmentStatus {
  if (status === "CANCELLED") {
    return "cancelled";
  }

  if (status === "COMPLETED") {
    return "completed";
  }

  if (status === "PENDING") {
    return "pending";
  }

  return "confirmed";
}

function formatDashboardMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

function buildVisitsSummary(args: {
  analyticsAppointments: Array<Pick<Appointment, "status" | "startAt" | "endAt">>;
  allTime: number;
  now: Date;
  timeZone: string;
}): DashboardVisitsSummary {
  const { analyticsAppointments, allTime, now, timeZone } = args;
  const countsByDay = new Map<string, number>();

  for (const appointment of analyticsAppointments) {
    if (appointment.status === "CANCELLED") {
      continue;
    }

    const key = formatZonedDateKey(appointment.startAt, timeZone);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }

  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  });
  const days: DashboardVisitsDay[] = [];
  let previousSevenDays = 0;

  for (let offset = 13; offset >= 0; offset -= 1) {
    const day = subDays(now, offset);
    const key = formatZonedDateKey(day, timeZone);
    const count = countsByDay.get(key) ?? 0;

    if (offset >= 7) {
      previousSevenDays += count;
      continue;
    }

    days.push({
      key,
      label: weekdayFormatter.format(day),
      count,
      isToday: offset === 0,
    });
  }

  const lastSevenDays = days.reduce((sum, day) => sum + day.count, 0);
  const deltaPercent =
    previousSevenDays > 0
      ? Math.round(((lastSevenDays - previousSevenDays) / previousSevenDays) * 100)
      : null;
  const lastThirtyDays = Array.from(countsByDay.values()).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    days,
    lastSevenDays,
    previousSevenDays,
    deltaLabel:
      deltaPercent === null
        ? null
        : `${deltaPercent >= 0 ? "+" : ""}${deltaPercent}% vs prior week`,
    deltaTone:
      deltaPercent === null || deltaPercent === 0
        ? "neutral"
        : deltaPercent > 0
          ? "up"
          : "down",
    lastThirtyDays,
    allTime,
  };
}

function buildRevenueSummary(payments: DashboardPaymentRow[]): DashboardRevenueSummary {
  const paidPayments = payments.filter((payment) => payment.status === "Paid");
  const outstandingCents = payments
    .filter(
      (payment) => payment.status === "Unpaid" || payment.status === "Partially Paid"
    )
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const paidCents = paidPayments.reduce((sum, payment) => sum + payment.amountCents, 0);

  return {
    monthToDateDisplay: formatDashboardMoney(paidCents),
    paidCountThisMonth: paidPayments.length,
    outstandingDisplay: formatDashboardMoney(outstandingCents),
    hasOutstanding: outstandingCents > 0,
    hasPayments: payments.length > 0,
  };
}

function buildPlanSummary(
  business: Business
): DashboardPlanSummary {
  const planName = planDisplayName(business.plan);

  return {
    planName,
    statusLabel: planStatusLabel(business.planStatus),
    isPro: isProBusinessPlan(business.plan),
  };
}

export function buildDashboardViewFromWorkspace(args: {
  business: Business;
  appointments: TodayAppointmentWithRelations[];
  lastClients: ClientSummaryRow[];
  nextAppointment: TodayAppointmentWithRelations | null;
  unreadCount: number;
  todaysHours: number;
  clientCount: number;
  appointmentCount: number;
  analyticsAppointments: Array<Pick<Appointment, "status" | "startAt" | "endAt">>;
  payments?: DashboardPaymentRow[];
  conversations?: DashboardConversationRow[];
  staffMembers?: DashboardStaffRow[];
  monthStart: Date;
  /** Start of the rolling 30-day analytics window (may be after monthStart late in the month). */
  recentWindowStart: Date;
  recentClientId?: string;
  now?: Date;
  timeZone?: string;
}): DashboardViewModel {
  const {
    business,
    appointments,
    lastClients,
    nextAppointment,
    unreadCount,
    clientCount,
    appointmentCount,
    analyticsAppointments,
    payments = [],
    conversations = [],
    staffMembers = [],
    monthStart,
    recentWindowStart,
    recentClientId,
    now = new Date(),
    timeZone = getAppTimeZone(),
  } = args;
  // The fetch window spans min(monthStart, recentWindowStart) so month-to-date
  // counts are complete late in the month. Each metric then filters to the
  // window it actually reports on, so the wider fetch never skews the others.
  const recentAppointments = analyticsAppointments.filter(
    (appointment) => appointment.startAt >= recentWindowStart
  );
  const recentCompleted = recentAppointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  );
  const recentFinal = recentAppointments.filter(
    (appointment) =>
      appointment.status === "COMPLETED" || appointment.status === "CANCELLED"
  );
  const completionRate =
    recentFinal.length > 0
      ? Math.round((recentCompleted.length / recentFinal.length) * 100)
      : 0;
  const completedThisMonth = analyticsAppointments.filter(
    (appointment) =>
      appointment.status === "COMPLETED" && appointment.startAt >= monthStart
  ).length;
  const averageDurationMinutes =
    recentCompleted.length > 0
      ? Math.round(
          recentCompleted.reduce(
            (sum, appointment) =>
              sum + Math.max(differenceInMinutes(appointment.endAt, appointment.startAt), 0),
            0
          ) / recentCompleted.length
        )
      : 0;
  const todayKey = formatZonedDateKey(now, timeZone);
  const visitsSummary = buildVisitsSummary({
    analyticsAppointments: recentAppointments,
    allTime: appointmentCount,
    now,
    timeZone,
  });
  const revenueSummary = buildRevenueSummary(payments);
  const conversationPreviews: DashboardConversationPreview[] = conversations.map(
    (conversation) => {
      const lastMessage = conversation.messages[0];
      const lastActivity = lastMessage?.sentAt ?? conversation.updatedAt;

      return {
        id: conversation.id,
        contactName: conversation.contactName,
        snippet: lastMessage?.body ?? "No messages yet",
        timeLabel:
          formatZonedDateKey(lastActivity, timeZone) === todayKey
            ? formatZonedTime(lastActivity, timeZone)
            : formatZonedShortDate(lastActivity, timeZone),
        unreadCount: conversation.unreadCount,
      };
    }
  );
  const staffToday: DashboardStaffToday[] = staffMembers.map((staffMember) => ({
    id: staffMember.id,
    name: staffMember.name,
    role: staffMember.role,
    appointmentsToday: appointments.filter(
      (appointment) =>
        appointment.staffMemberId === staffMember.id &&
        appointment.status !== "CANCELLED"
    ).length,
  }));
  const bookingHref = recentClientId
    ? `/calendar/new?client=${recentClientId}&date=${todayKey}`
    : `/calendar/new?date=${todayKey}`;
  const scheduleState =
    clientCount === 0
      ? "no-clients"
      : appointmentCount === 0
        ? "no-appointments"
        : appointments.length === 0
          ? "no-today"
          : "active";
  const appointmentAction: DashboardQuickAction = {
    label: appointmentCount === 0 ? "Book first appointment" : "New appointment",
    href: bookingHref,
    tone: "primary",
  };
  const clientAction: DashboardQuickAction = {
    label: "New client",
    href: "/clients/new",
    tone: "secondary",
  };
  const inboxAction: DashboardQuickAction = {
    label: "Open inbox",
    href: "/inbox",
    tone: "secondary",
  };
  const quickActions: DashboardQuickAction[] = [
    appointmentAction,
    clientCount === 0
      ? {
          label: "Add first client",
          href: "/clients/new?next=calendar",
          tone: "secondary",
        }
      : clientAction,
    inboxAction,
  ];
  const nextDashboardAppointment = nextAppointment
    ? {
        id: nextAppointment.id,
        time: formatZonedShortDateTime(nextAppointment.startAt, timeZone),
        startAtIso: nextAppointment.startAt.toISOString(),
        durationMinutes: Math.max(
          differenceInMinutes(nextAppointment.endAt, nextAppointment.startAt),
          0
        ),
        clientName: nextAppointment.client.name,
        service: nextAppointment.title,
        staffName: nextAppointment.staffMember?.name ?? "Workspace staff",
        status: toDashboardStatus(nextAppointment.status),
      }
    : null;

  return {
    businessName: business.name,
    heading: "Today",
    dateLabel: formatZonedLongDate(now, timeZone),
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      time: formatZonedTime(appointment.startAt, timeZone),
      startAtIso: appointment.startAt.toISOString(),
      durationMinutes: Math.max(differenceInMinutes(appointment.endAt, appointment.startAt), 0),
      clientName: appointment.client.name,
      service: appointment.title,
      staffName: appointment.staffMember?.name ?? "Workspace staff",
      status: toDashboardStatus(appointment.status),
    })),
    lastClients: lastClients.map((client) => ({
      id: client.id,
      name: client.name,
      phone: client.phone,
      updatedLabel: formatUpdatedLabel(client.updatedAt, now, timeZone),
    })),
    nextAppointment: nextDashboardAppointment,
    quickActions,
    unreadSummary: {
      unreadCount,
      title: "Unread messages",
      description:
        unreadCount > 0
          ? `Client replies are waiting for ${business.name}. Open inbox to keep response times tight and bookings moving.`
          : `No unread client messages for ${business.name} right now. Open inbox to review the latest conversation history.`,
    },
    planSummary: buildPlanSummary(business),
    visitsSummary,
    revenueSummary,
    conversationPreviews,
    staffToday,
    analyticsSummary: {
      todaysAppointments: appointments.length,
      completedThisMonth,
      completionRate,
      activeClients: clientCount,
      unreadMessages: unreadCount,
      averageDurationMinutes,
    },
    workspaceState: {
      clientCount,
      appointmentCount,
      recentClientId,
      scheduleState,
    },
  };
}
