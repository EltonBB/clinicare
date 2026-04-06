import { differenceInCalendarDays, differenceInMinutes, format } from "date-fns";
import type { Appointment, Business, Conversation } from "@prisma/client";

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
  trialLabel: string;
  detail: string;
  capacityUsedPercent: number;
  remainingSlotsLabel: string;
};

export type DashboardViewModel = {
  heading: string;
  dateLabel: string;
  appointments: DashboardAppointment[];
  quickActions: DashboardQuickAction[];
  unreadSummary: DashboardMessageSummary;
  planSummary: DashboardPlanSummary;
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
  business: Business,
  todaysAppointmentsCount: number,
  todaysHours: number
): DashboardPlanSummary {
  const planName =
    business.plan === "TRIAL"
      ? "Trial"
      : business.plan.charAt(0) + business.plan.slice(1).toLowerCase();
  const daysLeft =
    business.trialEndsAt != null
      ? Math.max(differenceInCalendarDays(business.trialEndsAt, new Date()), 0)
      : 0;
  const estimatedCapacity = Math.max(todaysHours, 1);
  const capacityUsedPercent = Math.min(
    Math.round((todaysAppointmentsCount / estimatedCapacity) * 100),
    100
  );
  const remainingSlots = Math.max(estimatedCapacity - todaysAppointmentsCount, 0);

  return {
    planName,
    trialLabel:
      business.plan === "TRIAL" ? `${daysLeft} days left` : business.planStatus.toLowerCase(),
    detail:
      business.plan === "TRIAL"
        ? "Your workspace is on the Vela trial with bookings, clients, reminders, and inbox tools available for MVP testing."
        : `Your workspace is on the ${planName} plan with clinic-scoped bookings, reminders, and inbox access.`,
    capacityUsedPercent,
    remainingSlotsLabel: `${remainingSlots} slots remaining for today`,
  };
}

export function buildDashboardViewFromWorkspace(args: {
  business: Business;
  appointments: TodayAppointmentWithRelations[];
  conversations: Pick<Conversation, "unreadCount">[];
  todaysHours: number;
}): DashboardViewModel {
  const { business, appointments, conversations, todaysHours } = args;
  const unreadCount = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  return {
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
    quickActions: [
      { label: "New appointment", href: "/calendar", tone: "primary" },
      { label: "New client", href: "/clients", tone: "secondary" },
    ],
    unreadSummary: {
      unreadCount,
      title: "Unread messages",
      description:
        unreadCount > 0
          ? `Client replies are waiting for ${business.name}. Open inbox to keep response times tight and bookings moving.`
          : `No unread client messages for ${business.name} right now. Open inbox to review the latest conversation history.`,
    },
    planSummary: buildPlanSummary(business, appointments.length, todaysHours),
  };
}
