import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), recordAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { appointment: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/audit", () => ({
  recordAudit: mocks.recordAudit,
  staffActor: (staff: { id: string }) => ({ type: "STAFF", id: staff.id }),
}));
vi.mock("@/lib/automation-events", () => ({ queueVisitMessage: vi.fn() }));
vi.mock("@/lib/mobile/inbox", () => ({ postSystemMessageToAdminThread: vi.fn() }));

import { getOwnAppointment } from "./appointments";

const ctx = {
  business: { id: "biz_1" },
  staffMember: { id: "staff_1" },
  locale: "en",
} as unknown as Parameters<typeof getOwnAppointment>[0];

describe("getOwnAppointment audit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records the staff member viewing the visit, ids only", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "appt_1",
      title: "Check-up",
      startAt: new Date("2026-11-04T09:00:00Z"),
      endAt: new Date("2026-11-04T09:30:00Z"),
      status: "CONFIRMED",
      notes: null,
      clientId: "client_1",
      client: { name: "Sample Patient" },
    });
    await getOwnAppointment(ctx, "appt_1");
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      businessId: "biz_1",
      actor: { type: "STAFF", id: "staff_1" },
      action: "appointment.view",
      clientId: "client_1",
      recordId: "appt_1",
    });
  });

  it("records nothing for a visit that isn't theirs", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await getOwnAppointment(ctx, "appt_x")).toBeNull();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
