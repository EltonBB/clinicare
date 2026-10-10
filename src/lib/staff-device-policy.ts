import type { Prisma } from "@prisma/client";

/** Sliding idle lifetime and absolute enrollment lifetime, shared by auth and push. */
export const DEVICE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEVICE_ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** A device that cannot authenticate must not remain paired or receive new pushes. */
export function activeStaffDeviceWhere(now = new Date()): Prisma.StaffDeviceWhereInput {
  return {
    revokedAt: null,
    expiresAt: { gt: now },
    createdAt: { gte: new Date(now.getTime() - DEVICE_ABSOLUTE_TTL_MS) },
    staffMember: { isActive: true, status: { not: "INACTIVE" } },
  };
}
