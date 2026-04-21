import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/business";
import { buildDashboardViewFromWorkspace } from "@/lib/dashboard";
import { startOfDay, endOfDay } from "date-fns";
import { syncWhatsAppConnectionForBusiness } from "@/lib/whatsapp-connection";

export default async function DashboardPage() {
  const { business } = await requireCurrentWorkspace("/dashboard", {
    missingBusinessRedirect: "/onboarding",
  });
  await syncWhatsAppConnectionForBusiness(business.id);

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const weekdayMap = [6, 0, 1, 2, 3, 4, 5];
  const todayWeekday = weekdayMap[new Date().getDay()] ?? 0;

  const [
    appointmentsResult,
    conversationsResult,
    todaysHoursResult,
    clientCountResult,
    recentClientResult,
    appointmentCountResult,
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
      prisma.conversation.findMany({
        where: {
          businessId: business.id,
        },
        select: {
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
    ]);

  const appointments =
    appointmentsResult.status === "fulfilled" ? appointmentsResult.value : [];
  const conversations =
    conversationsResult.status === "fulfilled" ? conversationsResult.value : [];
  const todaysHoursRecord =
    todaysHoursResult.status === "fulfilled" ? todaysHoursResult.value : null;
  const clientCount =
    clientCountResult.status === "fulfilled" ? clientCountResult.value : 0;
  const recentClient =
    recentClientResult.status === "fulfilled" ? recentClientResult.value : null;
  const appointmentCount =
    appointmentCountResult.status === "fulfilled" ? appointmentCountResult.value : 0;

  if (appointmentsResult.status === "rejected") {
    console.error("Dashboard appointments query failed", appointmentsResult.reason);
  }

  if (conversationsResult.status === "rejected") {
    console.error(
      "Dashboard conversations query failed",
      conversationsResult.reason
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
    conversations,
    todaysHours,
    clientCount,
    appointmentCount,
    recentClientId: recentClient?.id,
  });

  return <DashboardOverview view={view} />;
}
