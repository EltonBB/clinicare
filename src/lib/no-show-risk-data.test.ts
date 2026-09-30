import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  appointmentReminder: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import { getNoShowRiskAssessments } from "@/lib/no-show-risk-data";

const NOW = new Date("2026-07-01T00:00:00Z");
const FUTURE = new Date("2026-07-10T09:00:00Z");
const PAST = new Date("2026-06-20T09:00:00Z");

const row = (clientId: string, status: string, startAt: string) => ({
  clientId,
  status,
  startAt: new Date(startAt),
  updatedAt: new Date(startAt),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.$queryRaw.mockResolvedValue([]);
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
    expect(mocks.$queryRaw).not.toHaveBeenCalled();
  });

  it("reads every client's history in one query, then scores each appointment from only its own client's rows", async () => {
    mocks.$queryRaw.mockResolvedValue([
      row("c1", "NO_SHOW", "2026-06-01T09:00:00Z"),
      row("c1", "COMPLETED", "2026-05-01T09:00:00Z"),
      row("c2", "COMPLETED", "2026-05-01T09:00:00Z"),
      row("c2", "COMPLETED", "2026-04-01T09:00:00Z"),
    ]);

    const result = await getNoShowRiskAssessments({
      businessId: "biz_1",
      appointments: [
        { id: "a1", clientId: "c1", startAt: FUTURE, createdAt: PAST, status: "CONFIRMED" },
        { id: "a2", clientId: "c2", startAt: FUTURE, createdAt: PAST, status: "CONFIRMED" },
        // a second appointment for the same client must not add a client to the read
        { id: "a3", clientId: "c1", startAt: FUTURE, createdAt: PAST, status: "CONFIRMED" },
      ],
      now: NOW,
    });

    expect(result.get("a1")?.level).toBe("high");
    expect(result.get("a2")?.level).toBe("low");
    expect(result.get("a3")?.level).toBe("high");

    // One round trip, scoped to the workspace, to elapsed appointments only, and
    // to each client's five most recent visits.
    expect(mocks.$queryRaw).toHaveBeenCalledTimes(1);
    const [, ...values] = mocks.$queryRaw.mock.calls[0];
    expect(values).toEqual([["c1", "c2"], "biz_1", NOW, 5]);
  });

  it("scores a client the query returned nothing for as having too little history", async () => {
    const result = await getNoShowRiskAssessments({
      businessId: "biz_1",
      appointments: [{ id: "a1", clientId: "c_new", startAt: FUTURE, createdAt: PAST, status: "CONFIRMED" }],
      now: NOW,
    });

    expect(result.get("a1")).toMatchObject({ level: "low", insufficientHistory: true });
  });

  it("marks reminderSent true only for an appointment with a SENT reminder row", async () => {
    mocks.$queryRaw.mockResolvedValue([
      row("c1", "COMPLETED", "2026-05-01T09:00:00Z"),
      row("c1", "COMPLETED", "2026-04-01T09:00:00Z"),
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
    expect(mocks.$queryRaw).not.toHaveBeenCalled();
  });
});
