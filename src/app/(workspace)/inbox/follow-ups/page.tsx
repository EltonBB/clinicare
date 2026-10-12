import { isProBusinessPlan } from "@/lib/billing";
import { requireCurrentWorkspace } from "@/lib/business";
import { buildFollowUpsViewFromRecords } from "@/lib/follow-ups";
import { listPendingFollowUpDrafts } from "@/lib/follow-ups-data";
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace/workspace-layout";
import { FollowUpsList } from "@/components/inbox/follow-ups-list";

export default async function FollowUpsPage() {
  const { business } = await requireCurrentWorkspace("/inbox/follow-ups", {
    missingBusinessRedirect: "/onboarding",
  });

  const drafts = await listPendingFollowUpDrafts(business.id);
  // A downgraded workspace still lists its pending slot offers so staff can
  // skip them, but cannot send one (see markFollowUpDraftSent).
  const view = buildFollowUpsViewFromRecords({ drafts, canSendSlotOffers: isProBusinessPlan(business.plan) });

  return (
    <WorkspacePage size="wide">
      <WorkspaceHeader title="Follow-ups" backHref="/inbox" backLabel="Inbox" />
      <FollowUpsList items={view.items} />
    </WorkspacePage>
  );
}
