import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { prisma } from "@/lib/prisma";
import { requireCurrentWorkspace } from "@/lib/business";
import { buildDashboardViewFromWorkspace } from "@/lib/dashboard";
import { startOfDay, endOfDay } from "date-fns";

export default async function DashboardPage() {
  const { business } = await requireCurrentWorkspace("/dashboard", {
    missingBusinessRedirect: "/onboarding",
  });
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const weekdayMap = [6, 0, 1, 2, 3, 4, 5];
  const todayWeekday = weekdayMap[new Date().getDay()] ?? 0;

  const [appointmentsResult, conversationsResult, todaysHoursResult] =
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
    ]);

  const appointments =
    appointmentsResult.status === "fulfilled" ? appointmentsResult.value : [];
  const conversations =
    conversationsResult.status === "fulfilled" ? conversationsResult.value : [];
  const todaysHoursRecord =
    todaysHoursResult.status === "fulfilled" ? todaysHoursResult.value : null;

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
  });

  return <DashboardOverview view={view} />;
}
