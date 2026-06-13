import { after } from "next/server";

import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/business";
import { buildDashboardViewFromWorkspace } from "@/lib/dashboard";
import { subDays } from "date-fns";
import {
  getAppTimeZone,
  getZonedDayWindow,
  getZonedMonthStart,
  getZonedWeekday,
} from "@/lib/time-zone";
import { syncWhatsAppConnectionForBusiness } from "@/lib/whatsapp-connection";

export default async function DashboardPage() {
  const { business } = await requireCurrentWorkspace("/dashboard", {
    missingBusinessRedirect: "/onboarding",
  });
  after(async () => {
    try {
      await syncWhatsAppConnectionForBusiness(business.id);
    } catch {
      console.error("Failed to refresh WhatsApp connection after dashboard response.");
    }
  });

  const now = new Date();
  const timeZone = getAppTimeZone();
  const todayWindow = getZonedDayWindow(now, timeZone);
  const todayStart = todayWindow.start;
  const todayEnd = todayWindow.end;
  const monthStart = getZonedMonthStart(now, timeZone);
  const recentWindowStart = getZonedDayWindow(subDays(now, 29), timeZone).start;
  // Late in the month, monthStart precedes the 30-day window — fetch from
  // whichever is earlier so month-to-date metrics aren't truncated.
  const analyticsWindowStart =
    monthStart < recentWindowStart ? monthStart : recentWindowStart;
  const weekdayMap = [6, 0, 1, 2, 3, 4, 5];
  const todayWeekday = weekdayMap[getZonedWeekday(now, timeZone)] ?? 0;

  const [
    appointmentsResult,
    unreadMessagesResult,
    todaysHoursResult,
    clientCountResult,
    recentClientResult,
    appointmentCountResult,
    lastClientsResult,
    nextAppointmentResult,
    analyticsAppointmentsResult,
    paymentsResult,
    conversationsResult,
    staffMembersResult,
  ] =
    await Promise.allSettled([
      prisma.appointment.findMany({
        where: {
          businessId: business.id,
          startAt: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        include: {
          client: {
            select: {
              name: true,
            },
          },
          staffMember: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          startAt: "asc",
        },
      }),
      prisma.conversation.aggregate({
        where: {
          businessId: business.id,
        },
        _sum: {
          unreadCount: true,
        },
      }),
      prisma.businessHours.findFirst({
        where: {
          businessId: business.id,
          weekday: todayWeekday,
        },
      }),
      prisma.client.count({
        where: {
          businessId: business.id,
          isArchived: false,
        },
      }),
      prisma.client.findFirst({
        where: {
          businessId: business.id,
          isArchived: false,
        },
        select: {
          id: true,
        },
        orderBy: [
          {
            updatedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      }),
      prisma.appointment.count({
        where: {
          businessId: business.id,
        },
      }),
      prisma.client.findMany({
        where: {
          businessId: business.id,
          isArchived: false,
        },
        select: {
          id: true,
          name: true,
          phone: true,
          updatedAt: true,
        },
        orderBy: [
          {
            updatedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        take: 5,
      }),
      prisma.appointment.findFirst({
        where: {
          businessId: business.id,
          startAt: {
            gte: now,
          },
          status: {
            not: "COMPLETED",
          },
        },
        include: {
          client: {
            select: {
              name: true,
            },
          },
          staffMember: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          startAt: "asc",
        },
      }),
      prisma.appointment.findMany({
        where: {
          businessId: business.id,
          startAt: {
            gte: analyticsWindowStart,
            lte: todayEnd,
          },
        },
        select: {
          status: true,
          startAt: true,
          endAt: true,
        },
      }),
      prisma.clientPayment.findMany({
        where: {
          businessId: business.id,
          OR: [
            {
              paidAt: {
                gte: monthStart,
              },
            },
            {
              paidAt: null,
              createdAt: {
                gte: monthStart,
              },
            },
          ],
        },
        select: {
          amountCents: true,
          status: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      prisma.conversation.findMany({
        where: {
          businessId: business.id,
        },
        select: {
          id: true,
          contactName: true,
          unreadCount: true,
          updatedAt: true,
          messages: {
            select: {
              body: true,
              sentAt: true,
            },
            orderBy: {
              sentAt: "desc",
            },
            take: 1,
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 4,
      }),
      prisma.staffMember.findMany({
        where: {
          businessId: business.id,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          role: true,
        },
        orderBy: {
          name: "asc",
        },
        take: 6,
      }),
    ]);

  const appointments =
    appointmentsResult.status === "fulfilled" ? appointmentsResult.value : [];
  const unreadCount =
    unreadMessagesResult.status === "fulfilled"
      ? unreadMessagesResult.value._sum.unreadCount ?? 0
      : 0;
  const todaysHoursRecord =
    todaysHoursResult.status === "fulfilled" ? todaysHoursResult.value : null;
  const clientCount =
    clientCountResult.status === "fulfilled" ? clientCountResult.value : 0;
  const recentClient =
    recentClientResult.status === "fulfilled" ? recentClientResult.value : null;
  const appointmentCount =
    appointmentCountResult.status === "fulfilled" ? appointmentCountResult.value : 0;
  const lastClients =
    lastClientsResult.status === "fulfilled" ? lastClientsResult.value : [];
  const nextAppointment =
    nextAppointmentResult.status === "fulfilled" ? nextAppointmentResult.value : null;
  const analyticsAppointments =
    analyticsAppointmentsResult.status === "fulfilled"
      ? analyticsAppointmentsResult.value
      : [];
  const payments = paymentsResult.status === "fulfilled" ? paymentsResult.value : [];
  const conversations =
    conversationsResult.status === "fulfilled" ? conversationsResult.value : [];
  const staffMembers =
    staffMembersResult.status === "fulfilled" ? staffMembersResult.value : [];

  if (appointmentsResult.status === "rejected") {
    console.error("Dashboard appointments query failed", appointmentsResult.reason);
  }

  if (unreadMessagesResult.status === "rejected") {
    console.error(
      "Dashboard unread messages query failed",
      unreadMessagesResult.reason
    );
  }

  if (todaysHoursResult.status === "rejected") {
    console.error("Dashboard hours query failed", todaysHoursResult.reason);
  }

  if (clientCountResult.status === "rejected") {
    console.error("Dashboard client count query failed", clientCountResult.reason);
  }

  if (recentClientResult.status === "rejected") {
    console.error("Dashboard recent client query failed", recentClientResult.reason);
  }

  if (appointmentCountResult.status === "rejected") {
    console.error(
      "Dashboard appointment count query failed",
      appointmentCountResult.reason
    );
  }

  if (lastClientsResult.status === "rejected") {
    console.error("Dashboard recent clients query failed", lastClientsResult.reason);
  }

  if (nextAppointmentResult.status === "rejected") {
    console.error(
      "Dashboard next appointment query failed",
      nextAppointmentResult.reason
    );
  }

  if (analyticsAppointmentsResult.status === "rejected") {
    console.error(
      "Dashboard analytics appointments query failed",
      analyticsAppointmentsResult.reason
    );
  }

  if (paymentsResult.status === "rejected") {
    console.error("Dashboard payments query failed", paymentsResult.reason);
  }

  if (conversationsResult.status === "rejected") {
    console.error("Dashboard conversations query failed", conversationsResult.reason);
  }

  if (staffMembersResult.status === "rejected") {
    console.error("Dashboard staff query failed", staffMembersResult.reason);
  }

  const todaysHours =
    todaysHoursRecord && todaysHoursRecord.isOpen
      ? Math.max(
          Number(todaysHoursRecord.endTime.split(":")[0]) -
            Number(todaysHoursRecord.startTime.split(":")[0]),
          0
        )
      : 8;

  const view = buildDashboardViewFromWorkspace({
    business,
    appointments,
    lastClients,
    nextAppointment,
    unreadCount,
    todaysHours,
    clientCount,
    appointmentCount,
    analyticsAppointments,
    payments,
    conversations,
    staffMembers,
    monthStart,
    recentWindowStart,
    recentClientId: recentClient?.id,
    now,
    timeZone,
  });

  return <DashboardOverview view={view} />;
}
