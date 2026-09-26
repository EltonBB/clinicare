import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  waitlistEntry: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import {
  createWaitlistEntry,
  findMatchingWaitlistCandidates,
  listWaitingEntries,
  releaseWaitlistEntry,
} from "@/lib/waitlist-data";

const originalTimeZone = process.env.APP_TIME_ZONE;

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.APP_TIME_ZONE;
  } else {
    process.env.APP_TIME_ZONE = originalTimeZone;
  }
});

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wl_1",
    clientId: "client_1",
    client: { name: "Mira" },
    service: "Checkup",
    staffMemberId: null,
    staffMember: null,
    earliestDate: null,
    preferredDays: [],
    preferredFrom: null,
    preferredTo: null,
    notes: null,
    status: "WAITING",
    followUpDrafts: [],
    createdAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  };
}

describe("waitlist data layer", () => {
  it("lists WAITING and OFFERED entries for the business, oldest first", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([]);
    await listWaitingEntries("biz_1");
    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz_1", status: { in: ["WAITING", "OFFERED"] } },
        orderBy: { createdAt: "asc" },
      })
    );
  });

  it("labels an OFFERED entry's offer as pending or sent, and a WAITING entry as having none", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([
      entryRow({ id: "wl_waiting" }),
      entryRow({ id: "wl_pending", status: "OFFERED", followUpDrafts: [{ status: "PENDING" }] }),
      entryRow({ id: "wl_sent", status: "OFFERED", followUpDrafts: [{ status: "SENT" }] }),
    ]);

    const rows = await listWaitingEntries("biz_1");

    expect(rows.map((row) => [row.id, row.offer])).toEqual([
      ["wl_waiting", null],
      ["wl_pending", "pending"],
      ["wl_sent", "sent"],
    ]);
  });

  it("formats the earliest date in the clinic's zone, not UTC", async () => {
    process.env.APP_TIME_ZONE = "Europe/Budapest";
    // Stored as Budapest midnight on Oct 1 (= 22:00 UTC on Sep 30).
    mocks.waitlistEntry.findMany.mockResolvedValue([
      entryRow({ earliestDate: new Date("2026-09-30T22:00:00.000Z") }),
    ]);

    const [row] = await listWaitingEntries("biz_1");

    expect(row.earliestDateLabel).toBe("Oct 1");
  });

  it("creates an entry scoped to the business", async () => {
    mocks.waitlistEntry.create.mockResolvedValue({ id: "wl_1" });
    const result = await createWaitlistEntry({
      businessId: "biz_1", clientId: "client_1", service: "Checkup",
      staffMemberId: null, earliestDate: null, preferredDays: [], preferredFrom: null, preferredTo: null, notes: null,
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.waitlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessId: "biz_1", clientId: "client_1", service: "Checkup", status: "WAITING" }) })
    );
  });

  it("releases an entry back to WAITING only from OFFERED, scoped to the business, reporting whether it moved", async () => {
    mocks.waitlistEntry.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await releaseWaitlistEntry({ id: "wl_1", businessId: "biz_1" })).toBe(true);
    expect(mocks.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wl_1", businessId: "biz_1", status: "OFFERED" },
      data: { status: "WAITING" },
    });

    // Booked or removed meanwhile — left alone.
    mocks.waitlistEntry.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await releaseWaitlistEntry({ id: "wl_1", businessId: "biz_1" })).toBe(false);
  });

  it("finds WAITING candidates for the service, excluding the cancelling client, archived clients, and entries already offered this slot", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([
      {
        id: "wl_1",
        clientId: "client_2",
        service: "Checkup",
        staffMemberId: null,
        earliestDate: null,
        preferredDays: [],
        preferredFrom: null,
        preferredTo: null,
        createdAt: new Date("2026-06-01T00:00:00Z"),
        client: { name: "Mira" },
      },
    ]);

    const candidates = await findMatchingWaitlistCandidates({
      businessId: "biz_1",
      service: "Checkup",
      excludeClientId: "client_1",
      freedAppointmentId: "appt_1",
    });

    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz_1",
          status: "WAITING",
          service: { equals: "Checkup", mode: "insensitive" },
          clientId: { not: "client_1" },
          client: { isArchived: false, status: { not: "ARCHIVED" } },
          followUpDrafts: { none: { kind: "SLOT_OFFER", appointmentId: "appt_1" } },
        },
      })
    );
    expect(candidates).toEqual([expect.objectContaining({ id: "wl_1", clientId: "client_2", clientName: "Mira" })]);
    expect(candidates[0]).not.toHaveProperty("client");
  });
});
