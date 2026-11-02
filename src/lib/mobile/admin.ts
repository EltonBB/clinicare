import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { messages } from "@/i18n/messages";
import { prisma } from "@/lib/prisma";
import { unrevokedStaffDeviceWhere } from "@/lib/staff-device-policy";
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
  staffMemberId: string,
  locale: Locale = "en"
): Promise<MobileAccessStatus> {
  const copy = messages[locale].staff.mobile;
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
      // Keep otherwise-valid credentials visible for revocation even while the
      // staff member is inactive; reactivation could restore their access.
      where: { businessId, staffMemberId, ...unrevokedStaffDeviceWhere() },
      orderBy: { lastSeenAt: "desc" },
      select: { deviceLabel: true, platform: true, createdAt: true, lastSeenAt: true },
    }),
  ]);

  return {
    hasActiveCode: Boolean(activeCode),
    device: device
      ? {
          label: device.deviceLabel ?? copy.pairedDevice,
          platform: device.platform,
          pairedLabel: fmt(copy.pairedOn, { date: formatZonedFullDate(device.createdAt, undefined, locale) }),
          lastSeenLabel: fmt(copy.lastActive, {
            date: formatZonedShortDateTime(device.lastSeenAt, undefined, locale),
          }),
        }
      : null,
  };
}
