import type { Metadata } from "next";

import { AutomationsBoard } from "@/components/automations/automations-board";
import { StartProTrialButton } from "@/components/billing/start-pro-trial-button";
import { AutomationsHeader } from "@/components/automations/automations-header";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";
import { WorkspacePage } from "@/components/workspace/workspace-layout";
import { getAutomationSettings } from "@/lib/automations-data";
import { buildAutomationsView } from "@/lib/automations-view";
import { requireCurrentWorkspace } from "@/lib/business";
import { getPendingFollowUpDraftCount } from "@/lib/follow-ups-data";
import { prisma } from "@/lib/prisma";
import { proTrialState } from "@/lib/pro-trial";
import { AVAILABLE_STAFF_WHERE } from "@/lib/staff-eligibility";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.automations.meta.automations };
}

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
  const { locale, m } = await getI18n();
  const view = buildAutomationsView({ settings, plan: business.plan, reviewCount, locale });
  const trial = m.automations.proTrial;

  return (
    <WorkspacePage size="wide">
      <AutomationsHeader active="automations" showReviewTab={view.showReviewTab} reviewCount={view.reviewCount} />
      {/* The locked cards' one free way in, once the free Pro trial is on offer (lib/pro-trial.ts). */}
      {proTrialState(business).kind === "offered" ? (
        <section className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) bg-primary/6 p-3.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{trial.title}</p>
            <p className="text-sm text-muted-foreground">{trial.detail}</p>
          </div>
          <StartProTrialButton label={trial.start} className="h-9 rounded-(--radius-card)" />
        </section>
      ) : null}
      <WithMessages namespaces={["automations"]}>
        <AutomationsBoard
          cards={view.cards}
          editors={view.editors}
          clinicName={business.name}
          staffName={staff?.name ?? business.name}
          englishWording={view.englishWording}
        />
      </WithMessages>
    </WorkspacePage>
  );
}
