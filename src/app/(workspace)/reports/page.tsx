import { requireCurrentWorkspace } from "@/lib/business";
import { isProBusinessPlan } from "@/lib/billing";
import { ProFeatureLock } from "@/components/billing/pro-feature-lock";
import { ReportsOverview } from "@/components/reports/reports-overview";
import { buildReportsViewFromWorkspace } from "@/lib/reports";
import { prisma } from "@/lib/prisma";

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

  const [appointments, clients, messages] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        businessId: business.id,
      },
      select: {
        status: true,
        startAt: true,
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
        conversation: {
          businessId: business.id,
        },
      },
      select: {
        direction: true,
        sentAt: true,
      },
    }),
  ]);

  const view = buildReportsViewFromWorkspace({
    business,
    appointments,
    clients,
    messages,
  });

  return <ReportsOverview view={view} />;
}
