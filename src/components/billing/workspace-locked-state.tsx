import { LockKeyhole } from "lucide-react";

import { WorkspaceEmptyState } from "@/components/workspace/workspace-layout";

/**
 * Stands in for a form or a Pro surface while the workspace is read-only (its
 * plan ended): one quiet panel, one way out. `?settings=billing` opens the
 * Settings dialog on Billing over the current page.
 */
export function WorkspaceLockedState() {
  return (
    <WorkspaceEmptyState
      icon={LockKeyhole}
      title="This workspace is read-only"
      description="Its plan has ended, so nothing can be added or changed. Renew the plan to keep working."
      actionHref="?settings=billing"
      actionLabel="Renew plan"
    />
  );
}
