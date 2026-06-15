import { requireCurrentWorkspace } from "@/lib/business";
import { isProBusinessPlan } from "@/lib/billing";
import { ProFeatureLock } from "@/components/billing/pro-feature-lock";
import { ReportsOverview } from "@/components/reports/reports-overview";
import { buildReportsViewFromWorkspace } from "@/lib/reports";
import { prisma } from "@/lib/prisma";
import { getReportWorkspaceData } from "@/lib/report-data";
import { getZonedDayWindowFromParts } from "@/lib/time-zone";

export const maxDuration = 60;

function parseDateParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const roundTrip = new Date(Date.UTC(year, month - 1, day));

  // Reject impossible dates like 2026-02-31 (Date.UTC silently rolls them over).
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
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

  // Interpret ?from=&to= as calendar dates in the app time zone, independent
  // of the server's local time zone.
  let selectedRange: { start: Date; end: Date } | undefined;

  if (selectedFrom && selectedTo) {
    const start = getZonedDayWindowFromParts(
      selectedFrom.year,
      selectedFrom.month,
      selectedFrom.day
    ).start;
    const end = getZonedDayWindowFromParts(
      selectedTo.year,
      selectedTo.month,
      selectedTo.day
    ).end;

    if (end >= start) {
      selectedRange = { start, end };
    }
  }

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
    // Standard period pills (daily/weekly/monthly) always anchor to "now"; the
    // custom range drives only the custom period, so don't repoint `now` at the
    // range end or those pills would show data anchored to the wrong day.
    customRange: selectedRange,
  });

  return <ReportsOverview view={view} />;
}
