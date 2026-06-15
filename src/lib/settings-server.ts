import type { Business } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { resolveMediaDisplayUrl } from "@/lib/media-storage-server";
import { buildSettingsStateFromWorkspace, type SettingsState } from "@/lib/settings";

type SettingsUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

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
  const [businessHours, reminderSettings, whatsappConnection] = await Promise.all([
    prisma.businessHours.findMany({
      where: { businessId: business.id },
      orderBy: { weekday: "asc" },
    }),
    prisma.reminderSettings.findUnique({
      where: { businessId: business.id },
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
    whatsappConnection,
  });
}
