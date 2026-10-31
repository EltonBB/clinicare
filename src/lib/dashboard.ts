import { differenceInMinutes } from "date-fns";
import type { Appointment, Business, Client } from "@prisma/client";
import { intlLocale, type Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { messages, type Messages } from "@/i18n/messages";
import { isProBusinessPlan, planDisplayName, planStatusLabel } from "@/lib/billing";
import type { NoShowRiskAssessment } from "@/lib/no-show-risk";
import { formatCurrency } from "@/lib/utils";
import {
  formatZonedDateKey,
  formatZonedLongDate,
  formatZonedShortDate,
  formatZonedShortDateTime,
  formatZonedTime,
  getAppTimeZone,
} from "@/lib/time-zone";
import { conversationDisplayName } from "@/lib/inbox";

export type DashboardAppointmentStatus =
  | "confirmed"
  | "pending"
  | "cancelled"
  | "completed"
  | "no-show";

export type DashboardAppointment = {
  id: string;
  time: string;
  startAtIso: string;
  durationMinutes: number;
  clientName: string;
  service: string;
  staffName: string;
  status: DashboardAppointmentStatus;
  risk?: NoShowRiskAssessment;
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

export type DashboardVisitsDay = {
  key: string;
  label: string;
  count: number;
  isToday: boolean;
};

export type DashboardVisitsSummary = {
  days: DashboardVisitsDay[];
  lastSevenDays: number;
  lastThirtyDays: number;
  thisMonth: number;
  allTime: number;
};

export type DashboardRevenueSummary = {
  monthToDateDisplay: string;
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
  /** Today's visits for the KPI tile; cancelled and no-show ones stay listed but don't count. */
  activeAppointmentCount: number;
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

export type DashboardPaymentStatusGroup = {
  status: string;
  _sum: { amountCents: number | null };
};

/**
 * Pre-aggregated appointment metrics for the dashboard, computed in the DB
 * (see `lib/dashboard-data.ts`) instead of fetching the analytics window's rows
 * and reducing them in JS.
 */
export type DashboardAppointmentAggregates = {
  /** COMPLETED in the rolling 30-day window. */
  recentCompleted: number;
  /** CANCELLED in the rolling 30-day window. */
  recentCancelled: number;
  /** NO_SHOW in the rolling 30-day window. */
  recentNoShow: number;
  /** COMPLETED month-to-date. */
  completedThisMonth: number;
  /** Mean completed-visit length (minutes) in the rolling 30-day window. */
  averageDurationMinutes: number;
  /** Visit counts (excluding cancelled and no-show) per app-zone calendar day (YYYY-MM-DD) in the window. */
  visitCountsByDay: Array<{ key: string; count: number }>;
};

export type DashboardConversationRow = {
  id: string;
  contactName: string;
  phoneNumber: string;
  /** Name of the client this number belongs to, when there is one. */
  linkedClientName?: string | null;
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

type ViewCopy = Messages["dashboard"]["view"];

function formatUpdatedLabel(date: Date, now: Date, timeZone: string, copy: ViewCopy, locale: Locale) {
  const minutes = Math.max(Math.floor((now.getTime() - date.getTime()) / 60000), 0);

  if (minutes < 1) {
    return copy.updatedJustNow;
  }

  if (minutes < 60) {
    return fmt(copy.updatedMinutes, { count: minutes });
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return fmt(copy.updatedHours, { count: hours });
  }

  const days = Math.floor(hours / 24);

  if (days === 1) {
    return copy.updatedYesterday;
  }

  if (days < 7) {
    return fmt(copy.updatedDays, { count: days });
  }

  return fmt(copy.updatedOn, { date: formatZonedShortDate(date, timeZone, locale) });
}

function toDashboardStatus(status: Appointment["status"]): DashboardAppointmentStatus {
  if (status === "CANCELLED") {
    return "cancelled";
  }

  if (status === "NO_SHOW") {
    return "no-show";
  }

  if (status === "COMPLETED") {
    return "completed";
  }

  if (status === "PENDING") {
    return "pending";
  }

  return "confirmed";
}

// The calendar day `offset` days before `now` in the clinic's time zone. The
// subtraction runs on the date parts in UTC, so it never depends on the
// server's own zone, and a DST change can't push a 24-hour step onto the wrong
// calendar day (which would skip one day and repeat another).
function zonedDayBefore(now: Date, timeZone: string, offset: number) {
  const [year, month, day] = formatZonedDateKey(now, timeZone).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - offset, 12));

  return { key: date.toISOString().slice(0, 10), date };
}

export function buildVisitsSummary(args: {
  visitCountsByDay: Array<{ key: string; count: number }>;
  allTime: number;
  now: Date;
  timeZone: string;
  locale?: Locale;
}): DashboardVisitsSummary {
  const { visitCountsByDay, allTime, now, timeZone, locale = "en" } = args;
  const countsByDay = new Map<string, number>();

  for (const bucket of visitCountsByDay) {
    countsByDay.set(bucket.key, bucket.count);
  }

  // `zonedDayBefore` returns UTC-noon of the calendar date, so the weekday is
  // read in UTC — the clinic zone was already applied when picking the date.
  const weekdayFormatter = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    timeZone: "UTC",
  });
  const days: DashboardVisitsDay[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const { key, date } = zonedDayBefore(now, timeZone, offset);

    days.push({
      key,
      label: weekdayFormatter.format(date),
      count: countsByDay.get(key) ?? 0,
      isToday: offset === 0,
    });
  }

  const lastSevenDays = days.reduce((sum, day) => sum + day.count, 0);
  // The buckets can reach back past 30 days (to the 1st of the month), so sum
  // exactly the last 30 day keys rather than every bucket.
  let lastThirtyDays = 0;

  for (let offset = 29; offset >= 0; offset -= 1) {
    lastThirtyDays += countsByDay.get(zonedDayBefore(now, timeZone, offset).key) ?? 0;
  }

  // Calendar month-to-date, not a rolling window — distinct from lastThirtyDays.
  const currentMonthPrefix = formatZonedDateKey(now, timeZone).slice(0, 7);
  const thisMonth = Array.from(countsByDay.entries())
    .filter(([key]) => key.startsWith(currentMonthPrefix))
    .reduce((sum, [, count]) => sum + count, 0);

  return {
    days,
    lastSevenDays,
    lastThirtyDays,
    thisMonth,
    allTime,
  };
}

export function buildRevenueSummary(
  paymentGroups: DashboardPaymentStatusGroup[],
  currency: string,
  locale: Locale = "en"
): DashboardRevenueSummary {
  // Compact tiles show whole amounts, in the clinic's own currency.
  const formatDashboardMoney = (cents: number) => formatCurrency(cents, currency, { whole: true, locale });
  let paidCents = 0;

  for (const group of paymentGroups) {
    if (group.status === "Paid") {
      paidCents += group._sum.amountCents ?? 0;
    }
  }

  return { monthToDateDisplay: formatDashboardMoney(paidCents) };
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
  allTimeVisitCount: number;
  appointmentAggregates: DashboardAppointmentAggregates;
  paymentGroups?: DashboardPaymentStatusGroup[];
  conversations?: DashboardConversationRow[];
  staffMembers?: DashboardStaffRow[];
  recentClientId?: string;
  now?: Date;
  timeZone?: string;
  noShowRisk?: Map<string, NoShowRiskAssessment>;
  locale?: Locale;
}): DashboardViewModel {
  const {
    business,
    appointments,
    lastClients,
    nextAppointment,
    unreadCount,
    clientCount,
    appointmentCount,
    allTimeVisitCount,
    appointmentAggregates,
    paymentGroups = [],
    conversations = [],
    staffMembers = [],
    recentClientId,
    now = new Date(),
    timeZone = getAppTimeZone(),
    noShowRisk,
    locale = "en",
  } = args;
  const copy = messages[locale].dashboard.view;
  // Appointment metrics are aggregated in the DB (see lib/dashboard-data.ts) —
  // the rolling-window completion split, month-to-date completed count, mean
  // visit length, and per-day visit counts arrive pre-computed.
  const recentFinal =
    appointmentAggregates.recentCompleted +
    appointmentAggregates.recentCancelled +
    appointmentAggregates.recentNoShow;
  const completionRate =
    recentFinal > 0
      ? Math.round((appointmentAggregates.recentCompleted / recentFinal) * 100)
      : 0;
  const completedThisMonth = appointmentAggregates.completedThisMonth;
  const averageDurationMinutes = appointmentAggregates.averageDurationMinutes;
  const todayKey = formatZonedDateKey(now, timeZone);
  const visitsSummary = buildVisitsSummary({
    visitCountsByDay: appointmentAggregates.visitCountsByDay,
    allTime: allTimeVisitCount,
    now,
    timeZone,
    locale,
  });
  const revenueSummary = buildRevenueSummary(paymentGroups, business.currency, locale);
  const conversationPreviews: DashboardConversationPreview[] = conversations.map(
    (conversation) => {
      const lastMessage = conversation.messages[0];
      const lastActivity = lastMessage?.sentAt ?? conversation.updatedAt;

      return {
        id: conversation.id,
        // Named the way the Inbox names it (QA 2026-10-07: the card showed the
        // patient's own WhatsApp profile name instead of the clinic's record).
        contactName: conversationDisplayName(
          conversation.contactName,
          conversation.phoneNumber,
          conversation.linkedClientName
        ),
        snippet: lastMessage?.body ?? copy.noMessages,
        timeLabel:
          formatZonedDateKey(lastActivity, timeZone) === todayKey
            ? formatZonedTime(lastActivity, timeZone, locale)
            : formatZonedShortDate(lastActivity, timeZone, locale),
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
    label: appointmentCount === 0 ? copy.bookFirst : copy.newAppointment,
    href: bookingHref,
    tone: "primary",
  };
  const clientAction: DashboardQuickAction = {
    label: copy.newClient,
    href: "/clients/new",
    tone: "secondary",
  };
  const inboxAction: DashboardQuickAction = {
    label: copy.openInbox,
    href: "/inbox",
    tone: "secondary",
  };
  const quickActions: DashboardQuickAction[] = [
    appointmentAction,
    clientCount === 0
      ? {
          label: copy.addFirstClient,
          href: "/clients/new?next=calendar",
          tone: "secondary",
        }
      : clientAction,
    inboxAction,
  ];
  const nextDashboardAppointment = nextAppointment
    ? {
        id: nextAppointment.id,
        time: formatZonedShortDateTime(nextAppointment.startAt, timeZone, locale),
        startAtIso: nextAppointment.startAt.toISOString(),
        durationMinutes: Math.max(
          differenceInMinutes(nextAppointment.endAt, nextAppointment.startAt),
          0
        ),
        clientName: nextAppointment.client.name,
        service: nextAppointment.title,
        staffName: nextAppointment.staffMember?.name ?? copy.workspaceStaff,
        status: toDashboardStatus(nextAppointment.status),
        risk: noShowRisk?.get(nextAppointment.id),
      }
    : null;

  return {
    businessName: business.name,
    heading: copy.today,
    dateLabel: formatZonedLongDate(now, timeZone, locale),
    activeAppointmentCount: appointments.filter(
      (appointment) => appointment.status !== "CANCELLED" && appointment.status !== "NO_SHOW"
    ).length,
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      time: formatZonedTime(appointment.startAt, timeZone, locale),
      startAtIso: appointment.startAt.toISOString(),
      durationMinutes: Math.max(differenceInMinutes(appointment.endAt, appointment.startAt), 0),
      clientName: appointment.client.name,
      service: appointment.title,
      staffName: appointment.staffMember?.name ?? copy.workspaceStaff,
      status: toDashboardStatus(appointment.status),
      risk: noShowRisk?.get(appointment.id),
    })),
    lastClients: lastClients.map((client) => ({
      id: client.id,
      name: client.name,
      phone: client.phone,
      updatedLabel: formatUpdatedLabel(client.updatedAt, now, timeZone, copy, locale),
    })),
    nextAppointment: nextDashboardAppointment,
    quickActions,
    unreadSummary: {
      unreadCount,
      title: copy.unreadTitle,
      description: fmt(unreadCount > 0 ? copy.unreadWaiting : copy.unreadNone, { clinic: business.name }),
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
