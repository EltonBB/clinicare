import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// createWaitlistEntry's count+create run inside a transaction (see its own
// comment); everything else in this module still runs against the top-level
// client, so both need their own waitlistEntry mock.
const mocks = vi.hoisted(() => ({
  waitlistEntry: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
  tx: { waitlistEntry: { count: vi.fn(), create: vi.fn() } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import {
  createWaitlistEntry,
  findMatchingWaitlistCandidates,
  listWaitingEntries,
  releaseWaitlistEntry,
} from "@/lib/waitlist-data";

const originalTimeZone = process.env.APP_TIME_ZONE;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.$transaction.mockImplementation(async (cb: (client: unknown) => unknown) => cb(mocks.tx));
});

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
  it("lists WAITING and OFFERED entries for the business, oldest first, excluding an ineligible client (Codex #130)", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([]);
    await listWaitingEntries("biz_1");
    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz_1",
          status: { in: ["WAITING", "OFFERED"] },
          client: { isArchived: false, status: { notIn: ["INACTIVE", "ARCHIVED"] } },
        },
        orderBy: { createdAt: "asc" },
      })
    );
  });

  it("only counts an offer while its freed slot is still cancelled, ahead, and its staff (if any) still active, mirroring liveSlotOfferWhere (Codex #130)", async () => {
    const now = new Date("2026-09-01T08:00:00.000Z");
    mocks.waitlistEntry.findMany.mockResolvedValue([]);

    await listWaitingEntries("biz_1", now);

    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          followUpDrafts: expect.objectContaining({
            where: {
              kind: "SLOT_OFFER",
              status: { in: ["PENDING", "SENT"] },
              appointment: {
                status: "CANCELLED",
                startAt: { gt: now },
                OR: [
                  { staffMemberId: null },
                  { staffMember: { isActive: true, status: { not: "INACTIVE" } } },
                ],
              },
            },
          }),
        }),
      })
    );
  });

  it("reads an OFFERED entry with no live draft (its slot passed, the sweep hasn't run) as waiting", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([entryRow({ id: "wl_stale", status: "OFFERED", followUpDrafts: [] })]);

    const [row] = await listWaitingEntries("biz_1");

    expect(row.offer).toBeNull();
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

  const newEntry = {
    businessId: "biz_1", clientId: "client_1", service: "Checkup",
    staffMemberId: null, earliestDate: null, preferredDays: [], preferredFrom: null, preferredTo: null, notes: null,
  };

  it("creates an entry scoped to the business", async () => {
    mocks.tx.waitlistEntry.count.mockResolvedValue(0);
    mocks.tx.waitlistEntry.create.mockResolvedValue({ id: "wl_1" });
    const result = await createWaitlistEntry(newEntry);
    expect(result).toEqual({ ok: true });
    expect(mocks.tx.waitlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessId: "biz_1", clientId: "client_1", service: "Checkup", status: "WAITING" }) })
    );
  });

  it("refuses a new entry once the business's active waiting list is full, counting only eligible WAITING/OFFERED entries (Codex #130)", async () => {
    mocks.tx.waitlistEntry.count.mockResolvedValue(500);

    const result = await createWaitlistEntry(newEntry);

    expect(result).toEqual({ ok: false, error: "The waiting list is full. Remove an entry before adding another." });
    // Same eligibility rule as the panel listing — an entry whose client has
    // since gone Inactive/Archived doesn't hold a real slot against the cap.
    expect(mocks.tx.waitlistEntry.count).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        status: { in: ["WAITING", "OFFERED"] },
        client: { isArchived: false, status: { notIn: ["INACTIVE", "ARCHIVED"] } },
      },
    });
    expect(mocks.tx.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it("still accepts an entry when one slot is left", async () => {
    mocks.tx.waitlistEntry.count.mockResolvedValue(499);
    mocks.tx.waitlistEntry.create.mockResolvedValue({ id: "wl_1" });

    expect(await createWaitlistEntry(newEntry)).toEqual({ ok: true });
  });

  it("serializes the count and insert in one SERIALIZABLE transaction, retrying once on a write conflict (Codex #130)", async () => {
    mocks.tx.waitlistEntry.count.mockResolvedValue(0);
    mocks.tx.waitlistEntry.create.mockResolvedValue({ id: "wl_1" });

    await createWaitlistEntry(newEntry);

    expect(mocks.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    // Two staff racing the cap: the first transaction Postgres aborts as a
    // write conflict is retried once, and the retry's count already reflects
    // whichever entry committed first.
    const conflict = new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" });
    mocks.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (cb: (client: unknown) => unknown) => cb(mocks.tx));

    expect(await createWaitlistEntry(newEntry)).toEqual({ ok: true });
    expect(mocks.$transaction).toHaveBeenCalledTimes(3);
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

  it("finds WAITING candidates for the service, excluding the cancelling client, archived clients, and clients already offered this slot", async () => {
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
          clientId: { not: "client_1" },
          client: {
            isArchived: false,
            status: { notIn: ["INACTIVE", "ARCHIVED"] },
            // Per client (a duplicate entry is the same patient); EXPIRED (withdrawn) offers don't block a re-offer.
            followUpDrafts: {
              none: { kind: "SLOT_OFFER", appointmentId: "appt_1", status: { in: ["PENDING", "SENT", "DISMISSED"] } },
            },
          },
        },
      })
    );
    expect(candidates).toEqual([expect.objectContaining({ id: "wl_1", clientId: "client_2", clientName: "Mira" })]);
    expect(candidates[0]).not.toHaveProperty("client");
  });

  it("compares the service in memory, ignoring case and stray whitespace on both sides, never in SQL", async () => {
    const row = (id: string, service: string) => ({
      id,
      clientId: `client_${id}`,
      service,
      staffMemberId: null,
      earliestDate: null,
      preferredDays: [],
      preferredFrom: null,
      preferredTo: null,
      createdAt: new Date("2026-06-01T00:00:00Z"),
      client: { name: id },
    });
    mocks.waitlistEntry.findMany.mockResolvedValue([
      row("exact", "Checkup"),
      row("trailing", "Checkup "),
      row("leading", "  checkup"),
      row("other", "Cleaning"),
      row("longer", "Checkup and cleaning"),
    ]);

    const candidates = await findMatchingWaitlistCandidates({
      businessId: "biz_1",
      service: " CHECKUP\t",
      excludeClientId: "client_1",
      freedAppointmentId: "appt_1",
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual(["exact", "trailing", "leading"]);
    // A SQL equality can't trim the stored value, so the service isn't filtered in the query at all.
    expect(mocks.waitlistEntry.findMany.mock.calls[0][0].where).not.toHaveProperty("service");
  });
});
