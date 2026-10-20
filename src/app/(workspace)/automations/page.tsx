import type { Metadata } from "next";

import { AutomationsBoard } from "@/components/automations/automations-board";
import { AutomationsHeader } from "@/components/automations/automations-header";
import { WorkspacePage } from "@/components/workspace/workspace-layout";
import { getAutomationSettings } from "@/lib/automations-data";
import { buildAutomationsView } from "@/lib/automations-view";
import { requireCurrentWorkspace } from "@/lib/business";
import { getPendingFollowUpDraftCount } from "@/lib/follow-ups-data";
import { prisma } from "@/lib/prisma";
import { AVAILABLE_STAFF_WHERE } from "@/lib/staff-eligibility";

export const metadata: Metadata = { title: "Automations | Vela" };

export default async function AutomationsPage() {
  const { business } = await requireCurrentWorkspace("/automations", {
    missingBusinessRedirect: "/onboarding",
  });

  const [settings, reviewCount, staff] = await Promise.all([
    getAutomationSettings(business.id),
    getPendingFollowUpDraftCount(business.id),
    // A real name for the editor's preview of {staff_name}.
    prisma.staffMember.findFirst({
      where: { businessId: business.id, ...AVAILABLE_STAFF_WHERE },
      select: { name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const view = buildAutomationsView({ settings, plan: business.plan, reviewCount });

  return (
    <WorkspacePage size="wide">
      <AutomationsHeader active="automations" showReviewTab={view.showReviewTab} reviewCount={view.reviewCount} />
      <AutomationsBoard
        cards={view.cards}
        editors={view.editors}
        clinicName={business.name}
        staffName={staff?.name ?? business.name}
      />
    </WorkspacePage>
  );
}
