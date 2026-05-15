import { requireCurrentWorkspace } from "@/lib/business";
import { isProBusinessPlan } from "@/lib/billing";
import { ProFeatureLock } from "@/components/billing/pro-feature-lock";
import { ReportsOverview } from "@/components/reports/reports-overview";
import { buildReportsViewFromWorkspace } from "@/lib/reports";
import { prisma } from "@/lib/prisma";
import { getReportWorkspaceData } from "@/lib/report-data";
import { getZonedDayWindow } from "@/lib/time-zone";
import { parseISO } from "date-fns";

export const maxDuration = 60;

function parseDateParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { business } = await requireCurrentWorkspace("/reports", {
    missingBusinessRedirect: "/onboarding",
  });
  const { from, to } = await searchParams;
  const selectedFrom = parseDateParam(from);
  const selectedTo = parseDateParam(to);
  const selectedRange =
    selectedFrom && selectedTo && selectedTo >= selectedFrom
      ? {
          start: getZonedDayWindow(selectedFrom).start,
          end: getZonedDayWindow(selectedTo).end,
        }
      : undefined;

  if (!isProBusinessPlan(business.plan)) {
    return (
      <ProFeatureLock
        title="Reporting is part of Pro"
        description="Upgrade when you want analytics and premium workflow visibility beyond the core clinic operating system."
      />
    );
  }

  const [workspaceData, aiSnapshots] = await Promise.all([
    getReportWorkspaceData(business.id, selectedRange),
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
    now: selectedRange?.end,
    customRange: selectedRange,
  });

  return <ReportsOverview view={view} />;
}
