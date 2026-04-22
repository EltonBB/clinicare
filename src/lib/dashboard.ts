import { differenceInMinutes, format } from "date-fns";
import type { Appointment, Business, Conversation } from "@prisma/client";
import { planDisplayName, planStatusLabel } from "@/lib/billing";

export type DashboardAppointmentStatus = "confirmed" | "pending" | "cancelled";

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
};

export type DashboardWorkspaceState = {
  clientCount: number;
  appointmentCount: number;
  dashboardFocus: string;
  recentClientId?: string;
  scheduleState: "no-clients" | "no-appointments" | "no-today" | "active";
  selectedWidgets: string[];
};

export type DashboardViewModel = {
  businessName: string;
  heading: string;
  dateLabel: string;
  appointments: DashboardAppointment[];
  quickActions: DashboardQuickAction[];
  unreadSummary: DashboardMessageSummary;
  planSummary: DashboardPlanSummary;
  workspaceState: DashboardWorkspaceState;
};

type TodayAppointmentWithRelations = Appointment & {
  client: {
    name: string;
  };
  staffMember: {
    name: string;
  } | null;
};

function toDashboardStatus(status: Appointment["status"]): DashboardAppointmentStatus {
  if (status === "CANCELLED") {
    return "cancelled";
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
  };
}

export function buildDashboardViewFromWorkspace(args: {
  business: Business;
  appointments: TodayAppointmentWithRelations[];
  conversations: Pick<Conversation, "unreadCount">[];
  todaysHours: number;
  clientCount: number;
  appointmentCount: number;
  recentClientId?: string;
}): DashboardViewModel {
  const {
    business,
    appointments,
    conversations,
    clientCount,
    appointmentCount,
    recentClientId,
  } = args;
  const unreadCount = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const bookingHref = recentClientId
    ? `/calendar?new=1&client=${recentClientId}&date=${todayKey}`
    : `/calendar?new=1&date=${todayKey}`;
  const allowedWidgets = ["appointments", "clients", "inbox"] as const;
  type DashboardWidget = (typeof allowedWidgets)[number];
  const selectedWidgets = business.dashboardFocus
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is DashboardWidget =>
      allowedWidgets.includes(item as DashboardWidget)
    );
  const dashboardWidgets: DashboardWidget[] =
    selectedWidgets.length > 0 ? selectedWidgets : [...allowedWidgets];
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
  const actionsByWidget: Record<DashboardWidget, DashboardQuickAction> = {
    appointments: appointmentAction,
    clients:
      clientCount === 0
        ? {
            label: "Add first client",
            href: "/clients?new=1&next=calendar",
            tone: "primary",
          }
        : clientAction,
    inbox: inboxAction,
  };
  const quickActions = dashboardWidgets.map((widget, index) => ({
    ...actionsByWidget[widget],
    tone: index === 0 ? "primary" as const : "secondary" as const,
  }));

  return {
    businessName: business.name,
    heading: "Today",
    dateLabel: format(new Date(), "EEEE, MMMM d, yyyy"),
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      time: format(appointment.startAt, "hh:mm a"),
      durationMinutes: Math.max(differenceInMinutes(appointment.endAt, appointment.startAt), 0),
      clientName: appointment.client.name,
      service: appointment.title,
      staffName: appointment.staffMember?.name ?? "Workspace staff",
      status: toDashboardStatus(appointment.status),
    })),
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
    workspaceState: {
      clientCount,
      appointmentCount,
      dashboardFocus: dashboardWidgets[0] ?? "appointments",
      selectedWidgets: dashboardWidgets,
      recentClientId,
      scheduleState,
    },
  };
}
