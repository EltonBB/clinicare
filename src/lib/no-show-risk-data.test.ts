import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appointment: { findMany: vi.fn() },
  appointmentReminder: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import { getNoShowRiskAssessments } from "@/lib/no-show-risk-data";

const NOW = new Date("2026-07-01T00:00:00Z");
const FUTURE = new Date("2026-07-10T09:00:00Z");
const PAST = new Date("2026-06-20T09:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appointment.findMany.mockResolvedValue([]);
  mocks.appointmentReminder.findMany.mockResolvedValue([]);
});

describe("getNoShowRiskAssessments", () => {
  it("skips appointments that already started, without querying for them", async () => {
    const result = await getNoShowRiskAssessments({
      businessId: "biz_1",
      appointments: [{ id: "a1", clientId: "c1", startAt: PAST, createdAt: PAST, status: "CONFIRMED" }],
      now: NOW,
    });
    expect(result.size).toBe(0);
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });

  it("groups past visits by client and scores each upcoming appointment from only its own client's history", async () => {
    mocks.appointment.findMany.mockResolvedValue([
      { clientId: "c1", status: "NO_SHOW", startAt: new Date("2026-06-01T09:00:00Z"), updatedAt: new Date("2026-06-01T09:00:00Z") },
      { clientId: "c1", status: "COMPLETED", startAt: new Date("2026-05-01T09:00:00Z"), updatedAt: new Date("2026-05-01T09:00:00Z") },
      { clientId: "c2", status: "COMPLETED", startAt: new Date("2026-05-01T09:00:00Z"), updatedAt: new Date("2026-05-01T09:00:00Z") },
      { clientId: "c2", status: "COMPLETED", startAt: new Date("2026-04-01T09:00:00Z"), updatedAt: new Date("2026-04-01T09:00:00Z") },
    ]);

    const result = await getNoShowRiskAssessments({
      businessId: "biz_1",
      appointments: [
        { id: "a1", clientId: "c1", startAt: FUTURE, createdAt: PAST, status: "CONFIRMED" },
        { id: "a2", clientId: "c2", startAt: FUTURE, createdAt: PAST, status: "CONFIRMED" },
      ],
      now: NOW,
    });

    expect(result.get("a1")?.level).toBe("high");
    expect(result.get("a2")?.level).toBe("low");
    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz_1", clientId: { in: ["c1", "c2"] } }) })
    );
  });

  it("marks reminderSent true only for an appointment with a SENT reminder row", async () => {
    mocks.appointment.findMany.mockResolvedValue([
      { clientId: "c1", status: "COMPLETED", startAt: new Date("2026-05-01T09:00:00Z"), updatedAt: new Date("2026-05-01T09:00:00Z") },
      { clientId: "c1", status: "COMPLETED", startAt: new Date("2026-04-01T09:00:00Z"), updatedAt: new Date("2026-04-01T09:00:00Z") },
    ]);
    mocks.appointmentReminder.findMany.mockResolvedValue([{ appointmentId: "a1" }]);

    const result = await getNoShowRiskAssessments({
      businessId: "biz_1",
      appointments: [{ id: "a1", clientId: "c1", startAt: FUTURE, createdAt: PAST, status: "PENDING" }],
      now: NOW,
    });

    expect(result.get("a1")?.reasons).toContain("Hasn't confirmed the reminder");
  });

  it("returns an empty map and makes no queries when there is nothing upcoming", async () => {
    const result = await getNoShowRiskAssessments({ businessId: "biz_1", appointments: [], now: NOW });
    expect(result.size).toBe(0);
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });
});
