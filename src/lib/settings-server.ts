import type { Business } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { resolveMediaDisplayUrl } from "@/lib/media-storage-server";
import { buildSettingsStateFromWorkspace, type SettingsState } from "@/lib/settings";
import { DEFAULT_WORKFLOW_SETTINGS } from "@/lib/workflow-generators";

type SettingsUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/** The six editable workflow values — the whole client-visible WorkflowSettings shape. */
export const WORKFLOW_SETTINGS_SELECT = {
  rebookEnabled: true,
  rebookAfterMonths: true,
  paymentReminderEnabled: true,
  paymentReminderAfterDays: true,
  thankYouEnabled: true,
  thankYouDelayHours: true,
} as const;

export function resolveSettingsOwnerName(user: SettingsUser) {
  const fullName = user.user_metadata?.full_name;

  return typeof fullName === "string" && fullName.trim().length > 0
    ? fullName
    : user.email ?? "Workspace Owner";
}

/**
 * Single assembly point for SettingsState — used by the /settings route, the
 * settings dialog action, and the post-save refetch so the three entry points
 * can never drift apart.
 */
export async function loadSettingsState(
  user: SettingsUser,
  business: Business,
  options?: { ownerName?: string }
): Promise<SettingsState> {
  const [businessHours, reminderSettings, workflowSettings, whatsappConnection] =
    await Promise.all([
      prisma.businessHours.findMany({
        where: { businessId: business.id },
        orderBy: { weekday: "asc" },
      }),
      prisma.reminderSettings.findUnique({
        where: { businessId: business.id },
      }),
      // Only the six editable values — id/businessId/updatedAt never reach the
      // client, and the shape matches what saveWorkflowSettingsAction sends back.
      prisma.workflowSettings.findUnique({
        where: { businessId: business.id },
        select: WORKFLOW_SETTINGS_SELECT,
      }),
      prisma.whatsAppConnection.findUnique({
        where: { businessId: business.id },
      }),
    ]);

  const logoDisplayUrl = await resolveMediaDisplayUrl(business.logoUrl);

  return buildSettingsStateFromWorkspace({
    business,
    logoDisplayUrl,
    supportEmail: user.email ?? "",
    ownerName: options?.ownerName ?? resolveSettingsOwnerName(user),
    businessHours,
    reminderSettings,
    // No row yet (most workspaces) means the documented defaults, same
    // fallback the workflows cron applies.
    workflows: workflowSettings ?? DEFAULT_WORKFLOW_SETTINGS,
    whatsappConnection,
  });
}
