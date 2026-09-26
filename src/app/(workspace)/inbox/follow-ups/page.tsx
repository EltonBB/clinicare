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
  const view = buildFollowUpsViewFromRecords({ drafts });

  return (
    <WorkspacePage size="wide">
      <WorkspaceHeader title="Follow-ups" backHref="/inbox" backLabel="Inbox" />
      <FollowUpsList items={view.items} />
    </WorkspacePage>
  );
}
