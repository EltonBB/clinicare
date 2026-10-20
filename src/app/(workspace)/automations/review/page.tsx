import type { Metadata } from "next";

import { AutomationsHeader } from "@/components/automations/automations-header";
import { ReviewList } from "@/components/automations/review-list";
import { WorkspacePage } from "@/components/workspace/workspace-layout";
import { isProBusinessPlan } from "@/lib/billing";
import { requireCurrentWorkspace } from "@/lib/business";
import { buildFollowUpsViewFromRecords } from "@/lib/follow-ups";
import { listPendingFollowUpDrafts } from "@/lib/follow-ups-data";

export const metadata: Metadata = { title: "To review | Vela" };

export default async function AutomationsReviewPage() {
  const { business } = await requireCurrentWorkspace("/automations/review", {
    missingBusinessRedirect: "/onboarding",
  });

  const drafts = await listPendingFollowUpDrafts(business.id);
  const isPro = isProBusinessPlan(business.plan);
  // A downgraded workspace still lists its pending slot offers so staff can
  // skip them, but cannot send one (see markFollowUpDraftSent).
  const view = buildFollowUpsViewFromRecords({ drafts, canSendSlotOffers: isPro });

  return (
    <WorkspacePage size="wide">
      <AutomationsHeader active="review" showReviewTab={isPro || view.items.length > 0} reviewCount={view.items.length} />
      <ReviewList items={view.items} />
    </WorkspacePage>
  );
}
