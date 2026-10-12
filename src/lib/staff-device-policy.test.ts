import { describe, expect, it } from "vitest";

import { activeStaffDeviceWhere, DEVICE_ABSOLUTE_TTL_MS } from "./staff-device-policy";

describe("activeStaffDeviceWhere", () => {
  it("applies both expiry windows and the same staff eligibility as authentication", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    const filter = activeStaffDeviceWhere(now);
    expect(filter.revokedAt).toBeNull();
    expect(filter.expiresAt).toEqual({ gt: now });
    expect(filter.createdAt).toEqual({ gte: new Date(now.getTime() - DEVICE_ABSOLUTE_TTL_MS) });
    expect(filter.staffMember).toEqual({ isActive: true, status: { not: "INACTIVE" } });
  });
});
