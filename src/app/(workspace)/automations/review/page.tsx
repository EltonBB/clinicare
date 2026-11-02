import type { Metadata } from "next";

import { AutomationsHeader } from "@/components/automations/automations-header";
import { ReviewList } from "@/components/automations/review-list";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";
import { WorkspacePage } from "@/components/workspace/workspace-layout";
import { isProBusinessPlan } from "@/lib/billing";
import { requireCurrentWorkspace } from "@/lib/business";
import { buildFollowUpsViewFromRecords } from "@/lib/follow-ups-view";
import { listPendingFollowUpDrafts } from "@/lib/follow-ups-data";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.automations.meta.review };
}

export default async function AutomationsReviewPage() {
  const { business } = await requireCurrentWorkspace("/automations/review", {
    missingBusinessRedirect: "/onboarding",
  });

  const drafts = await listPendingFollowUpDrafts(business.id);
  const isPro = isProBusinessPlan(business.plan);
  // A downgraded workspace still lists its pending slot offers so staff can
  // skip them, but cannot send one (see markFollowUpDraftSent).
  const view = buildFollowUpsViewFromRecords({ drafts, canSendSlotOffers: isPro, locale: (await getI18n()).locale });

  return (
    <WorkspacePage size="wide">
      <AutomationsHeader active="review" showReviewTab={isPro || view.items.length > 0} reviewCount={view.items.length} />
      <WithMessages namespaces={["automations"]}>
        <ReviewList items={view.items} />
      </WithMessages>
    </WorkspacePage>
  );
}
