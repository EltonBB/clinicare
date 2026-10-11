import type { Prisma } from "@prisma/client";

/** Sliding idle lifetime and absolute enrollment lifetime, shared by auth and push. */
export const DEVICE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEVICE_ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Restorable credentials stay visible for owner revocation while staff is inactive. */
export function unrevokedStaffDeviceWhere(now = new Date()): Prisma.StaffDeviceWhereInput {
  return {
    revokedAt: null,
    expiresAt: { gt: now },
    createdAt: { gte: new Date(now.getTime() - DEVICE_ABSOLUTE_TTL_MS) },
  };
}

/** Push delivery also requires current staff eligibility, matching authentication. */
export function activeStaffDeviceWhere(now = new Date()): Prisma.StaffDeviceWhereInput {
  return {
    ...unrevokedStaffDeviceWhere(now),
    staffMember: { isActive: true, status: { not: "INACTIVE" } },
  };
}
