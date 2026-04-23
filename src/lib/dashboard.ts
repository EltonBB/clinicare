import { differenceInMinutes } from "date-fns";
import type { Appointment, Business, Client, Conversation } from "@prisma/client";
import { isProBusinessPlan, planDisplayName, planStatusLabel } from "@/lib/billing";
import {
  formatZonedDateKey,
  formatZonedLongDate,
  formatZonedShortDateTime,
  formatZonedTime,
  getAppTimeZone,
} from "@/lib/time-zone";

export const dashboardWidgetOptions = [
  "todayAppointments",
  "lastClients",
  "nextStaffAppointment",
  "analytics",
] as const;

export const configurableDashboardWidgetOptions = [
  "todayAppointments",
  "lastClients",
  "nextStaffAppointment",
  "analytics",
] as const;

export type DashboardWidget = (typeof dashboardWidgetOptions)[number];

export type DashboardAppointmentStatus = "confirmed" | "pending" | "cancelled" | "completed";

export type DashboardAppointment = {
  id: string;
  time: string;
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

export type DashboardWorkspaceState = {
  clientCount: number;
  appointmentCount: number;
  dashboardFocus: string;
  recentClientId?: string;
  scheduleState: "no-clients" | "no-appointments" | "no-today" | "active";
  selectedWidgets: DashboardWidget[];
};

export type DashboardClientSummary = Pick<Client, "id" | "name" | "phone">;

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
  workspaceState: DashboardWorkspaceState;
  availableWidgets: DashboardWidget[];
};

type TodayAppointmentWithRelations = Appointment & {
  client: {
    name: string;
  };
  staffMember: {
    name: string;
  } | null;
};

type ClientSummaryRow = Pick<Client, "id" | "name" | "phone">;

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
  conversations: Pick<Conversation, "unreadCount">[];
  todaysHours: number;
  clientCount: number;
  appointmentCount: number;
  analyticsAppointments: Array<Pick<Appointment, "status" | "startAt" | "endAt">>;
  monthStart: Date;
  recentClientId?: string;
  now?: Date;
  timeZone?: string;
}): DashboardViewModel {
  const {
    business,
    appointments,
    lastClients,
    nextAppointment,
    conversations,
    clientCount,
    appointmentCount,
    analyticsAppointments,
    monthStart,
    recentClientId,
    now = new Date(),
    timeZone = getAppTimeZone(),
  } = args;
  const unreadCount = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const completedAppointments = analyticsAppointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  );
  const finalAppointments = analyticsAppointments.filter(
    (appointment) =>
      appointment.status === "COMPLETED" || appointment.status === "CANCELLED"
  );
  const completionRate =
    finalAppointments.length > 0
      ? Math.round((completedAppointments.length / finalAppointments.length) * 100)
      : 0;
  const completedThisMonth = completedAppointments.filter(
    (appointment) => appointment.startAt >= monthStart
  ).length;
  const averageDurationMinutes =
    completedAppointments.length > 0
      ? Math.round(
          completedAppointments.reduce(
            (sum, appointment) =>
              sum + Math.max(differenceInMinutes(appointment.endAt, appointment.startAt), 0),
            0
          ) / completedAppointments.length
        )
      : 0;
  const todayKey = formatZonedDateKey(now, timeZone);
  const bookingHref = recentClientId
    ? `/calendar?new=1&client=${recentClientId}&date=${todayKey}`
    : `/calendar?new=1&date=${todayKey}`;
  const selectedWidgets = business.dashboardFocus
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is DashboardWidget =>
      dashboardWidgetOptions.includes(item as DashboardWidget)
    );
  const dashboardWidgets: DashboardWidget[] =
    selectedWidgets.length > 0 ? selectedWidgets : ["todayAppointments"];
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
    href: "/clients?new=1",
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
          href: "/clients?new=1&next=calendar",
          tone: "secondary",
        }
      : clientAction,
    inboxAction,
  ];
  const nextDashboardAppointment = nextAppointment
    ? {
        id: nextAppointment.id,
        time: formatZonedShortDateTime(nextAppointment.startAt, timeZone),
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
      durationMinutes: Math.max(differenceInMinutes(appointment.endAt, appointment.startAt), 0),
      clientName: appointment.client.name,
      service: appointment.title,
      staffName: appointment.staffMember?.name ?? "Workspace staff",
      status: toDashboardStatus(appointment.status),
    })),
    lastClients,
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
      dashboardFocus: dashboardWidgets[0] ?? "appointments",
      selectedWidgets: dashboardWidgets,
      recentClientId,
      scheduleState,
    },
    availableWidgets: [...configurableDashboardWidgetOptions],
  };
}
