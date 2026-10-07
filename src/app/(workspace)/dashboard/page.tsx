import { after } from "next/server";

import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/business";
import { isProBusinessPlan } from "@/lib/billing";
import { buildDashboardViewFromWorkspace } from "@/lib/dashboard";
import { getDashboardAppointmentAggregates } from "@/lib/dashboard-data";
import { getNoShowRiskAssessments } from "@/lib/no-show-risk-data";
import { phoneLookupKey } from "@/lib/inbox";
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
    appointmentAggregatesResult,
    paymentsResult,
    conversationsResult,
    staffMembersResult,
    allTimeVisitCountResult,
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
      getDashboardAppointmentAggregates({
        businessId: business.id,
        recentWindowStart,
        monthStart,
        todayEnd,
        timeZone,
      }),
      // Aggregate in the DB (per-status sums + counts) instead of fetching every
      // month-to-date payment row and reducing in JS — ships a handful of rows,
      // not the whole month's payments, and scales with payment volume.
      prisma.clientPayment.groupBy({
        by: ["status"],
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
        _sum: {
          amountCents: true,
        },
      }),
      prisma.conversation.findMany({
        where: {
          businessId: business.id,
        },
        select: {
          id: true,
          contactName: true,
          phoneNumber: true,
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
      // A no-show is not a visit that happened, so it stays out of the all-time
      // total just like the 7-day/30-day/this-month tiles (see dashboard-data.ts).
      prisma.appointment.count({
        where: {
          businessId: business.id,
          status: {
            notIn: ["CANCELLED", "NO_SHOW"],
          },
        },
      }),
    ]);

  const appointments =
    appointmentsResult.status === "fulfilled" ? appointmentsResult.value : [];
  const nextAppointment =
    nextAppointmentResult.status === "fulfilled" ? nextAppointmentResult.value : null;
  // Status alone isn't enough — it doesn't auto-flip once a visit's start
  // time passes, so an earlier-today pending/confirmed appointment must not
  // still read as an upcoming no-show risk (same class as Codex #129's
  // calendar-badge finding).
  const isScorable = (appointment: { status: string; startAt: Date }) =>
    (appointment.status === "PENDING" || appointment.status === "CONFIRMED") && appointment.startAt > now;
  const upcomingForRisk = appointments.filter(isScorable);

  // "Next up" is often not on today's list (tomorrow, or after today's last
  // visit), and its risk marker must not depend on which day it falls on.
  if (nextAppointment && isScorable(nextAppointment) && !upcomingForRisk.some((a) => a.id === nextAppointment.id)) {
    upcomingForRisk.push(nextAppointment);
  }

  // The risk badges are an extra on top of the schedule: a failed lookup (say a
  // database that hasn't had the NO_SHOW migration applied yet) must not take the
  // whole dashboard down, so it degrades to no badges — like every sibling query here.
  // The Messages card names each conversation the way the Inbox does: by the
  // client the number belongs to (most recently updated first, as the Inbox
  // picks). Started before the risk lookup so the two run together.
  const conversationRows =
    conversationsResult.status === "fulfilled" ? conversationsResult.value : [];
  const conversationPhoneKeys = [
    ...new Set(conversationRows.map((row) => phoneLookupKey(row.phoneNumber)).filter(Boolean)),
  ];
  const linkedClientsPromise =
    conversationPhoneKeys.length > 0
      ? prisma.client
          .findMany({
            where: { businessId: business.id, phoneKey: { in: conversationPhoneKeys } },
            select: { name: true, phoneKey: true },
            orderBy: { updatedAt: "desc" },
          })
          .catch((error) => {
            console.error("Dashboard conversation client lookup failed", error);
            return [];
          })
      : Promise.resolve([]);

  let noShowRisk: Awaited<ReturnType<typeof getNoShowRiskAssessments>> | undefined;
  if (isProBusinessPlan(business.plan) && upcomingForRisk.length > 0) {
    try {
      noShowRisk = await getNoShowRiskAssessments({
        businessId: business.id,
        appointments: upcomingForRisk.map((appointment) => ({
          id: appointment.id,
          clientId: appointment.clientId,
          startAt: appointment.startAt,
          createdAt: appointment.createdAt,
          status: appointment.status as "PENDING" | "CONFIRMED",
        })),
      });
    } catch (error) {
      console.error("Dashboard no-show risk lookup failed", error);
    }
  }
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
  const appointmentAggregates =
    appointmentAggregatesResult.status === "fulfilled"
      ? appointmentAggregatesResult.value
      : {
          recentCompleted: 0,
          recentCancelled: 0,
          recentNoShow: 0,
          completedThisMonth: 0,
          averageDurationMinutes: 0,
          visitCountsByDay: [],
        };
  const paymentGroups =
    paymentsResult.status === "fulfilled" ? paymentsResult.value : [];
  const clientNameByPhoneKey = new Map<string, string>();
  for (const client of await linkedClientsPromise) {
    if (client.phoneKey && !clientNameByPhoneKey.has(client.phoneKey)) {
      clientNameByPhoneKey.set(client.phoneKey, client.name);
    }
  }
  const conversations = conversationRows.map((row) => ({
    ...row,
    linkedClientName: clientNameByPhoneKey.get(phoneLookupKey(row.phoneNumber)) ?? null,
  }));
  const staffMembers =
    staffMembersResult.status === "fulfilled" ? staffMembersResult.value : [];
  const allTimeVisitCount =
    allTimeVisitCountResult.status === "fulfilled"
      ? allTimeVisitCountResult.value
      : 0;

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

  if (appointmentAggregatesResult.status === "rejected") {
    console.error(
      "Dashboard appointment aggregates query failed",
      appointmentAggregatesResult.reason
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

  if (allTimeVisitCountResult.status === "rejected") {
    console.error(
      "Dashboard all-time visit count query failed",
      allTimeVisitCountResult.reason
    );
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
    allTimeVisitCount,
    appointmentAggregates,
    paymentGroups,
    conversations,
    staffMembers,
    recentClientId: recentClient?.id,
    now,
    timeZone,
    noShowRisk,
  });

  return <DashboardOverview view={view} />;
}
