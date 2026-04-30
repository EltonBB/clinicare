import { requireCurrentWorkspace } from "@/lib/business";
import { isProBusinessPlan } from "@/lib/billing";
import { ProFeatureLock } from "@/components/billing/pro-feature-lock";
import { ReportsOverview } from "@/components/reports/reports-overview";
import { buildReportsViewFromWorkspace } from "@/lib/reports";
import { prisma } from "@/lib/prisma";
import { getReportWorkspaceData } from "@/lib/report-data";

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

  const [workspaceData, aiSnapshots] = await Promise.all([
    getReportWorkspaceData(business.id),
    prisma.analyticsSnapshot.findMany({
      where: {
        businessId: business.id,
      },
      orderBy: {
        generatedAt: "desc",
      },
      take: 18,
    }),
  ]);

  const view = buildReportsViewFromWorkspace({
    ...workspaceData,
    aiSnapshots,
  });

  return <ReportsOverview view={view} />;
}
