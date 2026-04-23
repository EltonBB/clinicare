import { requireCurrentWorkspace } from "@/lib/business";
import { isProBusinessPlan } from "@/lib/billing";
import { ProFeatureLock } from "@/components/billing/pro-feature-lock";
import { ReportsOverview } from "@/components/reports/reports-overview";
import { buildReportsViewFromWorkspace } from "@/lib/reports";
import { prisma } from "@/lib/prisma";
import { endOfDay, startOfDay, subDays } from "date-fns";

export default async function ReportsPage() {
  const { business } = await requireCurrentWorkspace("/reports", {
    missingBusinessRedirect: "/onboarding",
  });

  if (!isProBusinessPlan(business.plan)) {
    return (
      <ProFeatureLock
        title="Reporting is part of Pro"
        description="Upgrade when you want analytics and premium workflow visibility beyond the core clinic operating system."
      />
    );
  }

  const reportStart = startOfDay(subDays(new Date(), 209));
  const reportEnd = endOfDay(new Date());

  const [appointments, clients, messages, businessHours, staffMembers, conversations] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        businessId: business.id,
        startAt: {
          gte: reportStart,
          lte: reportEnd,
        },
      },
      select: {
        status: true,
        startAt: true,
        endAt: true,
        clientId: true,
        staffMemberId: true,
      },
    }),
    prisma.client.findMany({
      where: {
        businessId: business.id,
      },
      select: {
        createdAt: true,
        status: true,
        isArchived: true,
      },
    }),
    prisma.message.findMany({
      where: {
        sentAt: {
          gte: reportStart,
          lte: reportEnd,
        },
        conversation: {
          businessId: business.id,
        },
      },
      select: {
        direction: true,
        sentAt: true,
      },
    }),
    prisma.businessHours.findMany({
      where: {
        businessId: business.id,
      },
      select: {
        weekday: true,
        isOpen: true,
        startTime: true,
        endTime: true,
      },
    }),
    prisma.staffMember.findMany({
      where: {
        businessId: business.id,
      },
      select: {
        status: true,
        isActive: true,
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
  ]);

  const view = buildReportsViewFromWorkspace({
    business,
    appointments,
    clients,
    messages,
    businessHours,
    staffMembers,
    conversations,
  });

  return <ReportsOverview view={view} />;
}
