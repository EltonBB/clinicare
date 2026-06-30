import { prisma } from "@/lib/prisma";
import { formatZonedFullDate, formatZonedShortDateTime } from "@/lib/time-zone";

/**
 * Mobile-access state for a staff member, shown in the web admin's "Mobile
 * access" card. Server-only read (no PHI — device labels + timestamps only).
 */
export type MobileAccessStatus = {
  hasActiveCode: boolean;
  device: {
    label: string;
    platform: string | null;
    pairedLabel: string;
    lastSeenLabel: string;
  } | null;
};

export async function getMobileAccessStatus(
  businessId: string,
  staffMemberId: string
): Promise<MobileAccessStatus> {
  const [activeCode, device] = await Promise.all([
    prisma.staffAccessCode.findFirst({
      where: {
        businessId,
        staffMemberId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    }),
    prisma.staffDevice.findFirst({
      where: { businessId, staffMemberId, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
      select: { deviceLabel: true, platform: true, createdAt: true, lastSeenAt: true },
    }),
  ]);

  return {
    hasActiveCode: Boolean(activeCode),
    device: device
      ? {
          label: device.deviceLabel ?? "Paired device",
          platform: device.platform,
          pairedLabel: `Paired ${formatZonedFullDate(device.createdAt)}`,
          lastSeenLabel: `Last active ${formatZonedShortDateTime(device.lastSeenAt)}`,
        }
      : null,
  };
}
