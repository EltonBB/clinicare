import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// createWaitlistEntry's count+create run inside a transaction (see its own
// comment); everything else in this module still runs against the top-level
// client, so both need their own waitlistEntry mock.
const mocks = vi.hoisted(() => ({
  waitlistEntry: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
  tx: {
    waitlistEntry: { count: vi.fn(), create: vi.fn() },
    client: { findFirst: vi.fn() },
    staffMember: { findFirst: vi.fn() },
    $executeRaw: vi.fn(),
  },
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
  mocks.tx.client.findFirst.mockResolvedValue({ id: "client_1" }); // an eligible client by default
  mocks.tx.staffMember.findFirst.mockResolvedValue({ id: "staff_1" }); // an available staff member by default
  mocks.tx.$executeRaw.mockResolvedValue(1); // the row locks succeed by default
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
      entryRow({ id: "wl_sent", status: "OFFERED", followUpDrafts: [{ status: "SENT", sentAt: new Date() }] }),
      // Codex #130: claimed by Send but its message hasn't left yet.
      entryRow({ id: "wl_sending", status: "OFFERED", followUpDrafts: [{ status: "SENT", sentAt: null }] }),
    ]);

    const rows = await listWaitingEntries("biz_1");

    expect(rows.map((row) => [row.id, row.offer])).toEqual([
      ["wl_waiting", null],
      ["wl_pending", "pending"],
      ["wl_sent", "sent"],
      ["wl_sending", "pending"],
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

  // Codex #130: the action checks the client before this transaction starts, so
  // a client marked Inactive or Archived in between would still insert (the
  // foreign key is valid) and then be an entry nobody sees or matches.
  it("re-checks the client's eligibility inside the transaction and inserts nothing for one who just became ineligible", async () => {
    mocks.tx.client.findFirst.mockResolvedValue(null);

    const result = await createWaitlistEntry(newEntry);

    expect(result).toEqual({
      ok: false,
      error: "Choose an active client. Archived and inactive clients can't join the waiting list.",
    });
    expect(mocks.tx.client.findFirst).toHaveBeenCalledWith({
      where: { id: "client_1", businessId: "biz_1", isArchived: false, status: { notIn: ["INACTIVE", "ARCHIVED"] } },
      select: { id: true },
    });
    expect(mocks.tx.waitlistEntry.count).not.toHaveBeenCalled();
    expect(mocks.tx.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it("re-checks a pinned staff member's availability inside the transaction too", async () => {
    mocks.tx.staffMember.findFirst.mockResolvedValue(null);

    const result = await createWaitlistEntry({ ...newEntry, staffMemberId: "staff_1" });

    expect(result).toEqual({
      ok: false,
      error: "Choose an active staff member. Inactive staff can't be requested on the waiting list.",
    });
    expect(mocks.tx.staffMember.findFirst).toHaveBeenCalledWith({
      where: { id: "staff_1", businessId: "biz_1", isActive: true, status: { not: "INACTIVE" } },
      select: { id: true },
    });
    expect(mocks.tx.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it("creates a staff-pinned entry when the staff member is still available, and skips the staff read when nothing is pinned", async () => {
    mocks.tx.waitlistEntry.count.mockResolvedValue(0);
    mocks.tx.waitlistEntry.create.mockResolvedValue({ id: "wl_1" });

    expect(await createWaitlistEntry({ ...newEntry, staffMemberId: "staff_1" })).toEqual({ ok: true });
    expect(mocks.tx.staffMember.findFirst).toHaveBeenCalledTimes(1);

    mocks.tx.staffMember.findFirst.mockClear();
    expect(await createWaitlistEntry(newEntry)).toEqual({ ok: true });
    expect(mocks.tx.staffMember.findFirst).not.toHaveBeenCalled();
  });

  // Codex #130: this transaction is SERIALIZABLE, but the writers that make a
  // client or staff member ineligible (a status change, a delete) are READ
  // COMMITTED, and Postgres only detects a conflict between two SERIALIZABLE
  // transactions. A deactivation could scan for entries to retire, find none, and
  // commit while this insert was still pending — leaving a hidden WAITING entry.
  // Verified against a live Postgres: share-locking the rows once read makes the
  // deactivation wait for this insert (so its scan sees the entry), or this
  // transaction fail and re-read.
  describe("row locks", () => {
    const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ");

    beforeEach(() => {
      mocks.tx.waitlistEntry.count.mockResolvedValue(0);
      mocks.tx.waitlistEntry.create.mockResolvedValue({ id: "wl_1" });
    });

    it("share-locks the client once read, by id and never by string-building the SQL", async () => {
      await createWaitlistEntry(newEntry);

      expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
      const [call] = mocks.tx.$executeRaw.mock.calls;
      expect(sqlOf(call)).toBe('SELECT 1 FROM "Client" WHERE "id" = ? FOR SHARE');
      expect(call.slice(1)).toEqual(["client_1"]);
    });

    it("share-locks a pinned staff member too, after the client", async () => {
      await createWaitlistEntry({ ...newEntry, staffMemberId: "staff_1" });

      const calls = mocks.tx.$executeRaw.mock.calls;
      expect(calls.map(sqlOf)).toEqual([
        'SELECT 1 FROM "Client" WHERE "id" = ? FOR SHARE',
        'SELECT 1 FROM "StaffMember" WHERE "id" = ? FOR SHARE',
      ]);
      expect(calls.map((call) => call[1])).toEqual(["client_1", "staff_1"]);
    });

    it("locks only after the eligibility reads and before the count and the insert", async () => {
      await createWaitlistEntry({ ...newEntry, staffMemberId: "staff_1" });

      const order = [
        mocks.tx.client.findFirst,
        mocks.tx.staffMember.findFirst,
        mocks.tx.$executeRaw,
        mocks.tx.waitlistEntry.count,
        mocks.tx.waitlistEntry.create,
      ].map((fn) => fn.mock.invocationCallOrder[0]);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(mocks.tx.$executeRaw.mock.invocationCallOrder).toHaveLength(2);
      expect(mocks.tx.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(order[3]);
    });

    it("takes no lock for a client or staff member it already turned away", async () => {
      mocks.tx.client.findFirst.mockResolvedValueOnce(null);
      await createWaitlistEntry(newEntry);

      mocks.tx.staffMember.findFirst.mockResolvedValueOnce(null);
      await createWaitlistEntry({ ...newEntry, staffMemberId: "staff_1" });

      expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
      expect(mocks.tx.waitlistEntry.create).not.toHaveBeenCalled();
    });

    // What Postgres really reports when the client was deactivated after this
    // transaction's snapshot: a raw query's serialization failure arrives as P2010
    // with the SQLSTATE in meta.code, not as P2034 (captured from a live run).
    it("re-runs once when the lock reports the client changed since the read, and then turns the deactivated client away", async () => {
      mocks.tx.$executeRaw.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Raw query failed. Code: `40001`. Message: `could not serialize access due to concurrent update`", {
          code: "P2010",
          clientVersion: "test",
          meta: { code: "40001", message: "could not serialize access due to concurrent update" },
        })
      );
      // The retry's fresh read sees the deactivation that landed in between.
      mocks.tx.client.findFirst.mockResolvedValueOnce({ id: "client_1" }).mockResolvedValueOnce(null);

      const result = await createWaitlistEntry(newEntry);

      expect(result).toEqual({
        ok: false,
        error: "Choose an active client. Archived and inactive clients can't join the waiting list.",
      });
      expect(mocks.$transaction).toHaveBeenCalledTimes(2);
      expect(mocks.tx.waitlistEntry.create).not.toHaveBeenCalled();
    });

    it("does not retry a lock failure that is not a conflict", async () => {
      const failure = new Error("connection reset");
      mocks.tx.$executeRaw.mockRejectedValueOnce(failure);

      await expect(createWaitlistEntry(newEntry)).rejects.toBe(failure);
      expect(mocks.$transaction).toHaveBeenCalledTimes(1);
      expect(mocks.tx.waitlistEntry.create).not.toHaveBeenCalled();
    });
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
