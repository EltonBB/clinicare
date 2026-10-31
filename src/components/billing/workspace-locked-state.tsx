import { LockKeyhole } from "lucide-react";

import { WorkspaceEmptyState } from "@/components/workspace/workspace-layout";
import { getI18n } from "@/i18n/server";

/**
 * Stands in for a form or a Pro surface while the workspace is read-only (its
 * plan ended): one quiet panel, one way out. `?settings=billing` opens the
 * Settings dialog on Billing over the current page.
 */
export async function WorkspaceLockedState() {
  const t = (await getI18n()).m.common.locked;
  return (
    <WorkspaceEmptyState
      icon={LockKeyhole}
      title={t.title}
      description={t.description}
      actionHref="?settings=billing"
      actionLabel={t.renew}
    />
  );
}
