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

  const [appointments, conversations, todaysHoursRecord] = await Promise.all([
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
    prisma.businessHours.findUnique({
      where: {
        businessId_weekday: {
          businessId: business.id,
          weekday: todayWeekday,
        },
      },
    }),
  ]);

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
