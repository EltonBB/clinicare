import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The outer client (only expirePastSlotOffers' read + $transaction may use
// it) and the transaction client are separate objects, so every test can
// prove the offer work runs on the transaction it was handed.
const mocks = vi.hoisted(() => ({
  prisma: {
    followUpDraft: { findMany: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
    waitlistEntry: { findMany: vi.fn(), updateMany: vi.fn() },
    business: { findUniqueOrThrow: vi.fn() },
    appointment: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: {
    followUpDraft: { updateMany: vi.fn(), createMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    waitlistEntry: { findMany: vi.fn(), updateMany: vi.fn() },
    business: { findUniqueOrThrow: vi.fn() },
    appointment: { findFirst: vi.fn() },
    scheduleBlock: { findFirst: vi.fn() },
    staffMember: { findFirst: vi.fn() },
    businessHours: { findUnique: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { Prisma } from "@prisma/client";

import { INELIGIBLE_CLIENT_WHERE } from "@/lib/client-eligibility";
import {
  expirePastSlotOffers,
  findStaffAssignedOpenOfferAppointments,
  offerFreedSlot,
  removeWaitlistEntry,
  reofferFreedSlot,
  reofferFreedSlots,
  retireSlotOffersForAppointments,
  retireWaitlistEntries,
  retryOnWriteConflict,
  slotOfferBody,
  withdrawSlotOffers,
  withdrawSlotOffersOnClientAppointments,
} from "@/lib/slot-offers";

const tx = mocks.tx as unknown as Prisma.TransactionClient;
const NOW = new Date("2026-09-01T08:00:00.000Z");
const CANCELLED = {
  id: "appt_1",
  clientId: "client_cancelling",
  staffMemberId: "staff_1",
  title: "Checkup",
  // Monday Oct 5 2026, 09:00 in Budapest (CEST, UTC+2).
  startAt: new Date("2026-10-05T07:00:00.000Z"),
  endAt: new Date("2026-10-05T07:30:00.000Z"),
  // When it was cancelled — the offer's dedupe key names this cancellation cycle.
  updatedAt: new Date("2026-09-01T07:30:00.000Z"),
};
const CYCLE = CANCELLED.updatedAt.getTime();

function candidateRow(id: string, createdAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    clientId: `client_${id}`,
    service: "Checkup",
    staffMemberId: null,
    earliestDate: null,
    preferredDays: [],
    preferredFrom: null,
    preferredTo: null,
    createdAt: new Date(createdAt),
    client: { name: `Name ${id}` },
    ...overrides,
  };
}

// The clinic is open all day by default, so only the tests about working hours
// depend on them. The mock ignores the weekday it is asked for.
const OPEN_ALL_DAY = { isOpen: true, startTime: "00:00", endTime: "23:59" };

const originalTimeZone = process.env.APP_TIME_ZONE;

// tx.appointment.findFirst serves THREE different real queries in offerFreedSlot
// and its callers: offerSlotAgain's/removeWaitlistEntry's "read the still-
// cancelled row" (where.status === "CANCELLED"), the dedupe-key cycle read (no
// status filter), and — since the centralized availability check landed here
// too (Codex #130) — hasSchedulingConflict's own overlap query (where.status
// is the object { not: "CANCELLED" }). The three are distinguishable by that
// shape, so one mock can serve all of them correctly instead of the tests
// having to track call order. `read` answers the first two; `conflict`
// answers the third (null by default — no conflict).
function serveAppointmentReads(options: { read?: Record<string, unknown> | null; conflict?: unknown } = {}) {
  const { read = CANCELLED, conflict = null } = options;
  mocks.tx.appointment.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const status = where.status as { not?: string } | string | undefined;
    if (status && typeof status === "object" && status.not === "CANCELLED") {
      return conflict;
    }
    return read;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_TIME_ZONE = "Europe/Budapest";
  mocks.tx.business.findUniqueOrThrow.mockResolvedValue({ plan: "PRO" });
  mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.followUpDraft.createMany.mockResolvedValue({ count: 1 });
  mocks.tx.followUpDraft.findFirst.mockResolvedValue(null); // no live offer for the slot yet
  mocks.tx.followUpDraft.findMany.mockResolvedValue([]);
  serveAppointmentReads();
  mocks.tx.scheduleBlock.findFirst.mockResolvedValue(null); // no business-wide block by default
  mocks.tx.staffMember.findFirst.mockResolvedValue({ id: "staff_1" }); // the freed slot's staff is available by default
  mocks.tx.businessHours.findUnique.mockResolvedValue(OPEN_ALL_DAY);
  mocks.tx.$executeRaw.mockResolvedValue(undefined);
  mocks.prisma.$transaction.mockImplementation(async (cb: (client: unknown) => unknown) => cb(mocks.tx));
});

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.APP_TIME_ZONE;
  } else {
    process.env.APP_TIME_ZONE = originalTimeZone;
  }
});

function expectOuterClientUntouched() {
  expect(mocks.prisma.business.findUniqueOrThrow).not.toHaveBeenCalled();
  expect(mocks.prisma.waitlistEntry.findMany).not.toHaveBeenCalled();
  expect(mocks.prisma.waitlistEntry.updateMany).not.toHaveBeenCalled();
  expect(mocks.prisma.followUpDraft.createMany).not.toHaveBeenCalled();
}

describe("slotOfferBody", () => {
  it("carries the waiting client's name and the clinic-zone date and time, never the service", () => {
    const body = slotOfferBody("Mira", CANCELLED.startAt);

    expect(body).toBe("Hi Mira, a slot has opened up on October 5, 2026 at 9:00 AM. Reply here if you'd like it.");
    expect(body).not.toContain("Checkup");
  });
});

describe("offerFreedSlot", () => {
  it("offers a future slot to the best match: plan re-check, match read, flip and draft insert all on the transaction", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

    const offered = await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    expect(offered).toBe("wl_1");
    expect(mocks.tx.business.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "biz_1" }, select: { plan: true } });
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wl_1", businessId: "biz_1", status: "WAITING" },
      data: { status: "OFFERED" },
    });
    expect(mocks.tx.followUpDraft.createMany).toHaveBeenCalledWith({
      data: [
        {
          businessId: "biz_1",
          clientId: "client_wl_1",
          kind: "SLOT_OFFER",
          status: "PENDING",
          appointmentId: "appt_1",
          waitlistEntryId: "wl_1",
          dedupeKey: `SLOT_OFFER:appt_1:${CYCLE}:wl_1`,
          body: "Hi Name wl_1, a slot has opened up on October 5, 2026 at 9:00 AM. Reply here if you'd like it.",
        },
      ],
      skipDuplicates: true,
    });
    expectOuterClientUntouched();
  });

  it("checks the freed slot's assigned staff member is still available, by the shared rule", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

    await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    expect(mocks.tx.staffMember.findFirst).toHaveBeenCalledWith({
      where: { id: "staff_1", businessId: "biz_1", isActive: true, status: { not: "INACTIVE" } },
      select: { id: true },
    });
  });

  // Codex #130: Book refuses a slot whose staff went inactive and the liveness
  // check hides its offer, so offering it anyway makes a draft nobody can send —
  // and the hourly sweep then retires it and offers the slot to the next client,
  // again and again.
  it("offers nothing when the freed slot's assigned staff member is no longer available", async () => {
    mocks.tx.staffMember.findFirst.mockResolvedValue(null);
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

    const offered = await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    expect(offered).toBeNull();
    // Refused up front: no scheduling lock, no match read, no flip, no draft.
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.waitlistEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("doesn't look up staff for a genuinely unassigned slot", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

    const offered = await offerFreedSlot(tx, {
      businessId: "biz_1",
      cancelled: { ...CANCELLED, staffMemberId: null },
      now: NOW,
    });

    expect(offered).toBe("wl_1");
    expect(mocks.tx.staffMember.findFirst).not.toHaveBeenCalled();
  });

  // Codex #130: the clinic's hours can be shortened, or a weekday closed, after
  // an appointment was booked. The calendar's save would refuse a booking into
  // that slot, so the slot must not be promised to a waiting patient either.
  describe("working hours", () => {
    it("reads the clinic's hours for the slot's weekday in the schedule's Monday=0 convention", async () => {
      mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

      await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

      // CANCELLED is a Monday in Budapest.
      expect(mocks.tx.businessHours.findUnique).toHaveBeenCalledWith({
        where: { businessId_weekday: { businessId: "biz_1", weekday: 0 } },
        select: { isOpen: true, startTime: true, endTime: true },
      });
    });

    it("takes the weekday from the clinic's zone, not UTC: just after local midnight is still Monday", async () => {
      mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

      // Sunday 22:30 UTC is Monday 00:30 in Budapest (CEST).
      await offerFreedSlot(tx, {
        businessId: "biz_1",
        cancelled: {
          ...CANCELLED,
          startAt: new Date("2026-10-04T22:30:00.000Z"),
          endAt: new Date("2026-10-04T23:00:00.000Z"),
        },
        now: NOW,
      });

      expect(mocks.tx.businessHours.findUnique.mock.calls[0][0].where.businessId_weekday.weekday).toBe(0);
    });

    it.each([
      ["the weekday is switched off", { isOpen: false, startTime: "08:00", endTime: "20:00" }],
      ["the weekday has no hours row at all", null],
      ["the slot starts before opening", { isOpen: true, startTime: "09:30", endTime: "20:00" }],
      ["the slot would end after closing", { isOpen: true, startTime: "08:00", endTime: "09:15" }],
      ["the slot starts at closing time", { isOpen: true, startTime: "08:00", endTime: "09:00" }],
    ])("offers nothing when %s", async (_label, hours) => {
      mocks.tx.businessHours.findUnique.mockResolvedValue(hours);
      mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

      const offered = await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

      expect(offered).toBeNull();
      // Refused up front: no scheduling lock, no match read, no flip, no draft.
      expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
      expect(mocks.tx.waitlistEntry.findMany).not.toHaveBeenCalled();
      expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
      expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
    });

    it("still offers a slot that exactly fills the hours, from opening to closing", async () => {
      mocks.tx.businessHours.findUnique.mockResolvedValue({ isOpen: true, startTime: "09:00", endTime: "09:30" });
      mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

      expect(await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).toBe("wl_1");
    });
  });

  it("never offers the slot back to the client who cancelled it, to an archived client, or to a client with an open or let-go offer for it", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([]);

    await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    expect(mocks.tx.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { not: "client_cancelling" },
          client: {
            isArchived: false,
            status: { notIn: ["INACTIVE", "ARCHIVED"] },
            // Per client, so a duplicate entry can't be offered the same slot; an EXPIRED (withdrawn) offer doesn't block.
            followUpDrafts: {
              none: { kind: "SLOT_OFFER", appointmentId: "appt_1", status: { in: ["PENDING", "SENT", "DISMISSED"] } },
            },
          },
        }),
      })
    );
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("matches the service ignoring case and stray whitespace on either side", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([
      candidateRow("wl_trailing", "2026-01-01", { service: "Checkup " }),
      candidateRow("wl_leading", "2026-01-02", { service: "  CHECKUP" }),
      candidateRow("wl_longer", "2026-01-03", { service: "Checkup and cleaning" }),
    ]);
    mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 0 }); // keep walking so every match is tried

    await offerFreedSlot(tx, { businessId: "biz_1", cancelled: { ...CANCELLED, title: "checkup  " }, now: NOW });

    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => call.where.id)).toEqual(["wl_trailing", "wl_leading"]);
    // The database can't trim a stored value, so the service is not filtered in SQL.
    expect(mocks.tx.waitlistEntry.findMany.mock.calls[0][0].where).not.toHaveProperty("service");
  });

  it("names the cancellation cycle in the dedupe key: a later cancellation (a later updatedAt) gets a different key", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

    await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    serveAppointmentReads({ read: { updatedAt: new Date("2026-09-03T10:00:00.000Z") } });
    await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    const keys = mocks.tx.followUpDraft.createMany.mock.calls.map(([call]) => call.data[0].dedupeKey);
    expect(keys).toEqual([
      `SLOT_OFFER:appt_1:${CYCLE}:wl_1`,
      `SLOT_OFFER:appt_1:${new Date("2026-09-03T10:00:00.000Z").getTime()}:wl_1`,
    ]);
    expect(new Set(keys).size).toBe(2);
    // Read on this transaction, scoped to the workspace, only the timestamp.
    expect(mocks.tx.appointment.findFirst).toHaveBeenCalledWith({
      where: { id: "appt_1", businessId: "biz_1" },
      select: { updatedAt: true },
    });
  });

  it("is deterministic within one cycle: the same cancellation yields the same key every time", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

    await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });
    await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    const keys = mocks.tx.followUpDraft.createMany.mock.calls.map(([call]) => call.data[0].dedupeKey);
    expect(new Set(keys).size).toBe(1);
  });

  it("offers nothing (and flips nothing) when the appointment was deleted since it was cancelled", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);
    mocks.tx.appointment.findFirst.mockResolvedValue(null);

    expect(await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).toBeNull();
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("doesn't read the dedupe-key cycle when nobody matches — only the conflict check runs", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([]);

    expect(await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).toBeNull();
    // The availability check (Codex #130) always runs, even with no
    // candidates — it's a precondition, not conditioned on a match. Only the
    // separate dedupe-key cycle read is skipped, since ranking already came
    // back empty by the time that would run.
    expect(mocks.tx.appointment.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({ select: { updatedAt: true } })
    );
  });

  it("does nothing for a slot that has already started — no plan read, no match, no draft", async () => {
    const offered = await offerFreedSlot(tx, {
      businessId: "biz_1",
      cancelled: { ...CANCELLED, startAt: NOW },
      now: NOW,
    });

    expect(offered).toBeNull();
    expect(mocks.tx.business.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.tx.waitlistEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  // Codex #130: hasSchedulingConflict deliberately excludes CANCELLED rows,
  // so a real appointment can be booked directly into a freed slot without
  // ever touching cancelled.id — every offerFreedSlot call (not just the one
  // call site that happened to be audited first) must re-verify the slot is
  // still actually free before promising it, and take the same advisory lock
  // the ordinary booking path does before checking.
  it("offers nothing when another real appointment already occupies the freed slot", async () => {
    serveAppointmentReads({ conflict: { id: "appt_other" } });
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

    expect(await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).toBeNull();
    expect(mocks.tx.$executeRaw).toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.waitlistEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("offers nothing when a business-wide schedule block covers the freed slot", async () => {
    mocks.tx.scheduleBlock.findFirst.mockResolvedValue({ id: "block_1" });
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

    expect(await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).toBeNull();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("still offers the slot when nothing occupies it — the conflict check passes through", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

    expect(await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).toBe("wl_1");
    expect(mocks.tx.$executeRaw).toHaveBeenCalled();
  });

  it("offers nothing when the slot already has a live offer — one offer per freed slot", async () => {
    mocks.tx.followUpDraft.findFirst.mockResolvedValue({ id: "d_live" });
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);

    expect(await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).toBeNull();
    expect(mocks.tx.followUpDraft.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        appointmentId: "appt_1",
        status: { in: ["PENDING", "SENT"] },
        kind: "SLOT_OFFER",
        waitlistEntry: { status: "OFFERED" },
        appointment: {
          status: "CANCELLED",
          startAt: { gt: NOW },
          OR: [{ staffMemberId: null }, { staffMember: { isActive: true, status: { not: "INACTIVE" } } }],
        },
        client: { isArchived: false, status: { notIn: ["INACTIVE", "ARCHIVED"] } },
      },
      select: { id: true },
    });
    expect(mocks.tx.waitlistEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("does nothing when the workspace isn't on Pro", async () => {
    mocks.tx.business.findUniqueOrThrow.mockResolvedValue({ plan: "BASIC" });

    expect(await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).toBeNull();
    expect(mocks.tx.waitlistEntry.findMany).not.toHaveBeenCalled();
  });

  it("falls through to the next match when a concurrent offer already claimed the first", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([
      candidateRow("wl_new", "2026-05-01"),
      candidateRow("wl_old", "2026-01-01"),
    ]);
    // The longest-waiting entry loses its CAS; the next one wins.
    mocks.tx.waitlistEntry.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const offered = await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    expect(offered).toBe("wl_new");
    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => call.where.id)).toEqual(["wl_old", "wl_new"]);
    expect(mocks.tx.followUpDraft.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.tx.followUpDraft.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ waitlistEntryId: "wl_new" })] })
    );
  });

  it("keeps walking past five concurrently claimed matches instead of giving up on a five-attempt cap (Codex #130)", async () => {
    // Six candidates lose the race (a concurrent request claimed each one
    // between the read and the flip); the seventh is still free. A fixed
    // five-attempt cap used to give up before ever trying it, leaving the
    // slot unoffered even though a real waiting candidate remained.
    mocks.tx.waitlistEntry.findMany.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => candidateRow(`wl_${index}`, `2026-01-0${index + 1}`))
    );
    mocks.tx.waitlistEntry.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const offered = await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    expect(offered).toBe("wl_6");
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledTimes(7);
    expect(mocks.tx.followUpDraft.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ waitlistEntryId: "wl_6" })] })
    );
  });

  it("gives up only once every ranked match has been tried, however many there are", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => candidateRow(`wl_${index}`, `2026-01-${String(index + 1).padStart(2, "0")}`))
    );
    mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 0 });

    expect(await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).toBeNull();
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledTimes(12);
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("doesn't throw on a dedupe collision: releases that entry again and moves on to the next match", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([
      candidateRow("wl_old", "2026-01-01"),
      candidateRow("wl_new", "2026-05-01"),
    ]);
    // wl_old's draft already exists (0 created) -> released; wl_new gets it.
    mocks.tx.followUpDraft.createMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const offered = await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    expect(offered).toBe("wl_new");
    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => [call.where.id, call.data.status])).toEqual([
      ["wl_old", "OFFERED"],
      ["wl_old", "WAITING"],
      ["wl_new", "OFFERED"],
    ]);
  });

  it("returns cleanly with nobody offered when the only match collides", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_1", "2026-01-01")]);
    mocks.tx.followUpDraft.createMany.mockResolvedValue({ count: 0 });

    await expect(offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).resolves.toBeNull();
    // Not left OFFERED without a live draft.
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenLastCalledWith({
      where: { id: "wl_1", businessId: "biz_1", status: "OFFERED" },
      data: { status: "WAITING" },
    });
  });
});

describe("reofferFreedSlot", () => {
  it("releases the entry, then offers the same slot to the next match", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_next", "2026-02-01")]);

    const outcome = await reofferFreedSlot(tx, {
      businessId: "biz_1",
      waitlistEntryId: "wl_declined",
      appointmentId: "appt_1",
      now: NOW,
    });

    expect(outcome).toEqual({ released: true, offeredEntryId: "wl_next" });
    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => [call.where.id, call.data.status])).toEqual([
      ["wl_declined", "WAITING"],
      ["wl_next", "OFFERED"],
    ]);
    // Only a still-cancelled appointment in this workspace is re-offered.
    expect(mocks.tx.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "appt_1", businessId: "biz_1", status: "CANCELLED" } })
    );
    // The declined entry's client is excluded by the "already offered this slot" filter.
    expect(mocks.tx.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client: expect.objectContaining({
            followUpDrafts: {
              none: { kind: "SLOT_OFFER", appointmentId: "appt_1", status: { in: ["PENDING", "SENT", "DISMISSED"] } },
            },
          }),
        }),
      })
    );
  });

  it("leaves the slot alone, and says the entry wasn't released, when it was booked or removed meanwhile", async () => {
    mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 0 });

    expect(
      await reofferFreedSlot(tx, { businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: "appt_1", now: NOW })
    ).toEqual({ released: false, offeredEntryId: null });
    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalled();
  });

  it("an offer with no entry (it was deleted) releases nothing", async () => {
    expect(
      await reofferFreedSlot(tx, { businessId: "biz_1", waitlistEntryId: null, appointmentId: "appt_1", now: NOW })
    ).toEqual({ released: false, offeredEntryId: null });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("only releases when the appointment was deleted or reactivated", async () => {
    expect(
      await reofferFreedSlot(tx, { businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: null, now: NOW })
    ).toEqual({ released: true, offeredEntryId: null });

    mocks.tx.appointment.findFirst.mockResolvedValue(null); // no longer CANCELLED
    expect(
      await reofferFreedSlot(tx, { businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: "appt_1", now: NOW })
    ).toEqual({ released: true, offeredEntryId: null });

    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledTimes(2); // the two releases
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("releases but offers nothing when the slot has already passed", async () => {
    mocks.tx.appointment.findFirst.mockResolvedValue({ ...CANCELLED, startAt: new Date("2026-08-31T08:00:00.000Z") });

    expect(
      await reofferFreedSlot(tx, { businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: "appt_1", now: NOW })
    ).toEqual({ released: true, offeredEntryId: null });
    expect(mocks.tx.waitlistEntry.findMany).not.toHaveBeenCalled();
  });
});

describe("expirePastSlotOffers", () => {
  it("reads only open, stale slot offers for the given business, bounded", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([]);

    expect(await expirePastSlotOffers("biz_1", NOW)).toEqual({ expired: 0, released: 0 });

    const [{ where, take }] = mocks.prisma.followUpDraft.findMany.mock.calls[0];
    expect(take).toBe(200);
    expect(where).toEqual({
      businessId: "biz_1",
      kind: "SLOT_OFFER",
      AND: [
        {
          OR: [
            { appointmentId: null },
            { appointment: { startAt: { lte: NOW } } },
            { appointment: { status: { not: "CANCELLED" } } },
            { client: INELIGIBLE_CLIENT_WHERE },
            {
              appointment: {
                staffMemberId: { not: null },
                NOT: { staffMember: { isActive: true, status: { not: "INACTIVE" } } },
              },
            },
          ],
        },
        { OR: [{ status: "PENDING" }, { status: "SENT", waitlistEntry: { status: "OFFERED" } }] },
      ],
    });
  });

  it("sweeps every workspace when no businessId is given", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([]);

    await expirePastSlotOffers(undefined, NOW);

    expect(mocks.prisma.followUpDraft.findMany.mock.calls[0][0].where).not.toHaveProperty("businessId");
  });

  it("expires each stale draft and releases its entry in one transaction per draft", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([
      { id: "d_pending", businessId: "biz_1", waitlistEntryId: "wl_1" },
      { id: "d_sent", businessId: "biz_1", waitlistEntryId: "wl_2" },
    ]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });

    expect(await expirePastSlotOffers("biz_1", NOW)).toEqual({ expired: 2, released: 2 });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "d_pending", businessId: "biz_1", kind: "SLOT_OFFER" }),
        data: { status: "EXPIRED" },
      })
    );
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wl_2", businessId: "biz_1", status: "OFFERED" },
      data: { status: "WAITING" },
    });
  });

  // Codex #130: an offer retired only because its waiting client was archived or
  // deactivated leaves the appointment cancelled and ahead, and nothing else ever
  // revisits it — so the sweep itself must offer the slot to the next match.
  it("re-offers a still-cancelled slot to the next match in the same transaction when it retires an offer", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([
      { id: "d_archived", businessId: "biz_1", waitlistEntryId: "wl_archived", appointmentId: "appt_1" },
    ]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_next", "2026-02-01")]);

    expect(await expirePastSlotOffers("biz_1", NOW)).toEqual({ expired: 1, released: 1 });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "appt_1", businessId: "biz_1", status: "CANCELLED" } })
    );
    expect(mocks.tx.followUpDraft.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ waitlistEntryId: "wl_next", appointmentId: "appt_1" })] })
    );
  });

  // Codex #130: before the staff check lived inside offerFreedSlot, the sweep
  // retired an offer whose staff had gone inactive, re-offered the slot to the
  // next client, and found that new draft stale at once on the next run.
  it("retires and releases an offer whose assigned staff went inactive, without drafting the slot again", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([
      { id: "d_staff", businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: "appt_1" },
    ]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.staffMember.findFirst.mockResolvedValue(null);
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_next", "2026-02-01")]);

    expect(await expirePastSlotOffers("biz_1", NOW)).toEqual({ expired: 1, released: 1 });

    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wl_1", businessId: "biz_1", status: "OFFERED" },
      data: { status: "WAITING" },
    });
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.waitlistEntry.findMany).not.toHaveBeenCalled();
  });

  it("re-offers nothing when the appointment is no longer cancelled (slot taken, deleted or passed)", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([
      { id: "d_1", businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: "appt_1" },
    ]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.appointment.findFirst.mockResolvedValue(null);

    expect(await expirePastSlotOffers("biz_1", NOW)).toEqual({ expired: 1, released: 1 });
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("does not look for a re-offer when the guarded retire changed nothing", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([
      { id: "d_1", businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: "appt_1" },
    ]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 0 });

    await expirePastSlotOffers("biz_1", NOW);

    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalled();
  });

  it("is idempotent: a draft handled since the read is neither expired nor released", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([{ id: "d_1", businessId: "biz_1", waitlistEntryId: "wl_1" }]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 0 });

    expect(await expirePastSlotOffers("biz_1", NOW)).toEqual({ expired: 0, released: 0 });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });
});

describe("withdrawSlotOffers (appointment un-cancelled)", () => {
  it("expires the appointment's open offers and puts their entries back on the waiting list, on the caller's tx", async () => {
    mocks.tx.followUpDraft.findMany.mockResolvedValue([
      { id: "d_pending", businessId: "biz_1", waitlistEntryId: "wl_1" },
      { id: "d_sent", businessId: "biz_1", waitlistEntryId: "wl_2" },
    ]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });

    expect(await withdrawSlotOffers(tx, { businessId: "biz_1", appointmentId: "appt_1" })).toEqual({
      expired: 2,
      released: 2,
    });

    const openForAppointment = {
      kind: "SLOT_OFFER",
      appointmentId: "appt_1",
      OR: [{ status: "PENDING" }, { status: "SENT", waitlistEntry: { status: "OFFERED" } }],
    };
    expect(mocks.tx.followUpDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: "biz_1", ...openForAppointment } })
    );
    // Each write is CAS-guarded by the same "still open" predicate.
    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "d_sent", businessId: "biz_1", ...openForAppointment },
      data: { status: "EXPIRED" },
    });
    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => [call.where.id, call.data.status])).toEqual([
      ["wl_1", "WAITING"],
      ["wl_2", "WAITING"],
    ]);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("leaves an entry alone when its draft was booked or handled since the read", async () => {
    mocks.tx.followUpDraft.findMany.mockResolvedValue([{ id: "d_1", businessId: "biz_1", waitlistEntryId: "wl_1" }]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 0 });

    expect(await withdrawSlotOffers(tx, { businessId: "biz_1", appointmentId: "appt_1" })).toEqual({
      expired: 0,
      released: 0,
    });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });
});

// Codex #130: deleting a client cascades their appointments away; a cancelled
// one whose slot was offered to ANOTHER client would lose that offer's link
// (SET NULL) and strand the other client's entry as OFFERED.
describe("withdrawSlotOffersOnClientAppointments", () => {
  const openOffer = [{ status: "PENDING" }, { status: "SENT", waitlistEntry: { status: "OFFERED" } }];

  it("withdraws the open offer on each of the client's appointments, putting the other clients' entries back on the list", async () => {
    mocks.tx.followUpDraft.findMany
      .mockResolvedValueOnce([{ appointmentId: "appt_a" }, { appointmentId: "appt_b" }])
      .mockResolvedValueOnce([{ id: "d_a", businessId: "biz_1", waitlistEntryId: "wl_a" }])
      .mockResolvedValueOnce([{ id: "d_b", businessId: "biz_1", waitlistEntryId: "wl_b" }]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });

    await withdrawSlotOffersOnClientAppointments(tx, { businessId: "biz_1", clientId: "client_dying" });

    // Open offers whose appointment belongs to this client, one row per appointment.
    expect(mocks.tx.followUpDraft.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        businessId: "biz_1",
        kind: "SLOT_OFFER",
        OR: openOffer,
        appointment: { clientId: "client_dying" },
      },
      select: { appointmentId: true },
      distinct: ["appointmentId"],
    });
    expect(mocks.tx.followUpDraft.updateMany.mock.calls.map(([call]) => [call.where.id, call.data.status])).toEqual([
      ["d_a", "EXPIRED"],
      ["d_b", "EXPIRED"],
    ]);
    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => [call.where.id, call.data.status])).toEqual([
      ["wl_a", "WAITING"],
      ["wl_b", "WAITING"],
    ]);
  });

  it("only withdraws: the slot is about to disappear, so nothing is offered on, locked or drafted", async () => {
    mocks.tx.followUpDraft.findMany
      .mockResolvedValueOnce([{ appointmentId: "appt_a" }])
      .mockResolvedValueOnce([{ id: "d_a", businessId: "biz_1", waitlistEntryId: "wl_a" }]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });

    await withdrawSlotOffersOnClientAppointments(tx, { businessId: "biz_1", clientId: "client_dying" });

    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.waitlistEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is not capped: a client with more than 20 open offers has every one of them withdrawn", async () => {
    const rows = Array.from({ length: 35 }, (_, i) => ({ appointmentId: `appt_${i}` }));
    mocks.tx.followUpDraft.findMany.mockResolvedValueOnce(rows).mockResolvedValue([]);

    await withdrawSlotOffersOnClientAppointments(tx, { businessId: "biz_1", clientId: "client_busy" });

    expect(mocks.tx.followUpDraft.findMany.mock.calls[0][0]).not.toHaveProperty("take");
    // One withdrawal read per appointment, after the first read that found them.
    expect(mocks.tx.followUpDraft.findMany).toHaveBeenCalledTimes(36);
  });

  it("drops a null appointmentId and does nothing for a client with no open offers", async () => {
    mocks.tx.followUpDraft.findMany.mockResolvedValueOnce([{ appointmentId: null }]);

    await withdrawSlotOffersOnClientAppointments(tx, { businessId: "biz_1", clientId: "client_dying" });
    expect(mocks.tx.followUpDraft.findMany).toHaveBeenCalledTimes(1);

    mocks.tx.followUpDraft.findMany.mockReset();
    mocks.tx.followUpDraft.findMany.mockResolvedValueOnce([]);

    await withdrawSlotOffersOnClientAppointments(tx, { businessId: "biz_1", clientId: "client_dying" });
    expect(mocks.tx.followUpDraft.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });
});

// Codex #130: the appointment FK's SET NULL clears staffMemberId the instant
// a staff row is deleted, so a stale offer for one of their freed slots must
// be found BEFORE the delete — this exact filter would match nothing after.
describe("findStaffAssignedOpenOfferAppointments", () => {
  it("finds the distinct appointments behind this staff member's open slot offers", async () => {
    mocks.tx.followUpDraft.findMany.mockResolvedValue([
      { appointmentId: "appt_1" },
      { appointmentId: "appt_2" },
    ]);

    const result = await findStaffAssignedOpenOfferAppointments(tx, {
      businessId: "biz_1",
      staffMemberId: "staff_dying",
    });

    expect(result).toEqual(["appt_1", "appt_2"]);
    expect(mocks.tx.followUpDraft.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        kind: "SLOT_OFFER",
        OR: [{ status: "PENDING" }, { status: "SENT", waitlistEntry: { status: "OFFERED" } }],
        appointment: { staffMemberId: "staff_dying", status: "CANCELLED" },
      },
      select: { appointmentId: true },
      distinct: ["appointmentId"],
    });
  });

  // Codex #130: a staff-wide read capped at 20 left every appointment past the
  // 20th un-retired — their staff link goes NULL on delete, so those offers
  // would then read as live unassigned slots.
  it("is not capped: a staff member with more than 20 open offers has every one of them retired", async () => {
    const rows = Array.from({ length: 35 }, (_, i) => ({ appointmentId: `appt_${i}` }));
    mocks.tx.followUpDraft.findMany.mockResolvedValue(rows);

    const result = await findStaffAssignedOpenOfferAppointments(tx, {
      businessId: "biz_1",
      staffMemberId: "staff_busy",
    });

    expect(result).toHaveLength(35);
    expect(mocks.tx.followUpDraft.findMany.mock.calls[0][0]).not.toHaveProperty("take");
  });

  it("drops a null appointmentId instead of handing it to the retirement loop", async () => {
    mocks.tx.followUpDraft.findMany.mockResolvedValue([{ appointmentId: null }, { appointmentId: "appt_1" }]);

    const result = await findStaffAssignedOpenOfferAppointments(tx, {
      businessId: "biz_1",
      staffMemberId: "staff_dying",
    });

    expect(result).toEqual(["appt_1"]);
  });

  it("returns nothing when this staff member holds no open slot offers", async () => {
    mocks.tx.followUpDraft.findMany.mockResolvedValue([]);

    const result = await findStaffAssignedOpenOfferAppointments(tx, {
      businessId: "biz_1",
      staffMemberId: "staff_clean",
    });

    expect(result).toEqual([]);
  });
});

describe("retireSlotOffersForAppointments", () => {
  it("withdraws each appointment's stale offer, then re-offers the freed slot to the next match", async () => {
    mocks.tx.followUpDraft.findMany
      .mockResolvedValueOnce([{ id: "d_offer", businessId: "biz_1", waitlistEntryId: "wl_1" }]) // withdrawSlotOffers' read
      .mockResolvedValueOnce([]); // no live offer for the slot yet (offerFreedSlot's own dedupe check)
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_next", "2026-02-01")]);
    // offerSlotAgain re-reads the appointment fresh — by now (after the
    // staff delete this always runs after) it genuinely has no staff.
    serveAppointmentReads({ read: { ...CANCELLED, staffMemberId: null } });

    await retireSlotOffersForAppointments(tx, { businessId: "biz_1", appointmentIds: ["appt_1"], now: NOW });

    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "d_offer", appointmentId: "appt_1" }),
      data: { status: "EXPIRED" },
    });
    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => [call.where.id ?? call.where, call.data.status])).toContainEqual([
      "wl_1",
      "WAITING",
    ]);
    expect(mocks.tx.followUpDraft.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ waitlistEntryId: "wl_next", appointmentId: "appt_1" })] })
    );
  });

  it("processes every listed appointment, not just the first", async () => {
    mocks.tx.followUpDraft.findMany.mockResolvedValue([]); // nothing open for either — no dismissal work
    serveAppointmentReads({ read: null }); // neither appointment is still cancelled

    await retireSlotOffersForAppointments(tx, {
      businessId: "biz_1",
      appointmentIds: ["appt_1", "appt_2"],
      now: NOW,
    });

    const appointmentReads = mocks.tx.appointment.findFirst.mock.calls.map(([call]) => call.where.id);
    expect(appointmentReads).toContain("appt_1");
    expect(appointmentReads).toContain("appt_2");
  });

  it("does nothing for an empty list", async () => {
    await retireSlotOffersForAppointments(tx, { businessId: "biz_1", appointmentIds: [], now: NOW });

    expect(mocks.tx.followUpDraft.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalled();
  });
});

describe("retireWaitlistEntries", () => {
  const OPEN_ENTRY_STATUSES = { in: ["WAITING", "OFFERED"] };

  it("retires every active entry of a client — offer drafts first, then the entry — and returns the freed appointments", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([{ id: "wl_a" }, { id: "wl_b" }]);
    // wl_a holds an offer for appt_1 (dismissed before its entry write, nothing
    // new in the catch-up pass); wl_b holds none.
    mocks.tx.followUpDraft.findMany
      .mockResolvedValueOnce([{ id: "d_a", appointmentId: "appt_1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });

    const freed = await retireWaitlistEntries(tx, { businessId: "biz_1", clientId: "client_1" });

    expect(mocks.tx.waitlistEntry.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", status: OPEN_ENTRY_STATUSES, clientId: "client_1" },
      select: { id: true },
    });
    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => [call.where.id, call.data.status])).toEqual([
      ["wl_a", "REMOVED"],
      ["wl_b", "REMOVED"],
    ]);
    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "d_a" }), data: { status: "DISMISSED" } })
    );
    expect(mocks.tx.followUpDraft.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.waitlistEntry.updateMany.mock.invocationCallOrder[0]
    );
    expect(freed).toEqual(["appt_1"]);
  });

  it("selects the entries pinned to a staff member when given one", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([]);

    await retireWaitlistEntries(tx, { businessId: "biz_1", staffMemberId: "staff_1" });

    expect(mocks.tx.waitlistEntry.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", status: OPEN_ENTRY_STATUSES, staffMemberId: "staff_1" },
      select: { id: true },
    });
  });

  it("only hands the freed slots back — it never re-offers them itself, so the caller can finish its own writes first", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([{ id: "wl_a" }]);
    mocks.tx.followUpDraft.findMany.mockResolvedValueOnce([{ id: "d_a", appointmentId: "appt_1" }]).mockResolvedValueOnce([]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });

    await retireWaitlistEntries(tx, { businessId: "biz_1", clientId: "client_1" });

    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("does no writes for a client with nothing on the waiting list", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([]);

    expect(await retireWaitlistEntries(tx, { businessId: "biz_1", clientId: "client_1" })).toEqual([]);
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the slot of an offer that landed during the entry write's lock wait, and one whose appointment is already gone", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([{ id: "wl_a" }]);
    mocks.tx.followUpDraft.findMany
      .mockResolvedValueOnce([{ id: "d_old", appointmentId: null }]) // an offer whose appointment row is already gone
      .mockResolvedValueOnce([{ id: "d_new", appointmentId: "appt_2" }]); // committed while the entry write waited
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });

    expect(await retireWaitlistEntries(tx, { businessId: "biz_1", clientId: "client_1" })).toEqual([null, "appt_2"]);
  });

  it("still dismisses the open offers of an entry that another writer retired first, and reports their slots", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([{ id: "wl_a" }]);
    mocks.tx.followUpDraft.findMany.mockResolvedValueOnce([{ id: "d_a", appointmentId: "appt_1" }]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 0 }); // already REMOVED / FILLED by someone else

    expect(await retireWaitlistEntries(tx, { businessId: "biz_1", clientId: "client_1" })).toEqual(["appt_1"]);
  });
});

describe("reofferFreedSlots", () => {
  it("offers each distinct freed slot to its next match once, skipping nulls", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_next", "2026-02-01")]);

    await reofferFreedSlots(tx, { businessId: "biz_1", appointmentIds: ["appt_1", null, "appt_1"], now: NOW });

    const appointmentReads = mocks.tx.appointment.findFirst.mock.calls
      .map(([call]) => call.where)
      .filter((where) => where.status === "CANCELLED");
    expect(appointmentReads).toEqual([{ id: "appt_1", businessId: "biz_1", status: "CANCELLED" }]);
    expect(mocks.tx.followUpDraft.createMany).toHaveBeenCalledTimes(1);
  });

  it("skips a slot that stopped being offerable (the appointment is no longer cancelled)", async () => {
    serveAppointmentReads({ read: null });

    await reofferFreedSlots(tx, { businessId: "biz_1", appointmentIds: ["appt_1"], now: NOW });

    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("does nothing for an empty list", async () => {
    await reofferFreedSlots(tx, { businessId: "biz_1", appointmentIds: [], now: NOW });

    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalled();
  });
});

describe("removeWaitlistEntry", () => {
  const OPEN_FOR_ENTRY = {
    businessId: "biz_1",
    waitlistEntryId: "wl_removed",
    kind: "SLOT_OFFER",
    OR: [{ status: "PENDING" }, { status: "SENT", waitlistEntry: { status: "OFFERED" } }],
  };

  it("removing an entry that holds an offer dismisses the offer and re-offers the slot to the next match, in one transaction", async () => {
    mocks.tx.followUpDraft.findMany
      .mockResolvedValueOnce([{ id: "d_offer", appointmentId: "appt_1" }]) // before the entry write
      .mockResolvedValueOnce([]); // catch-up pass after it
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_next", "2026-02-01")]);

    expect(await removeWaitlistEntry({ id: "wl_removed", businessId: "biz_1", now: NOW })).toEqual({ ok: true });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.followUpDraft.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: OPEN_FOR_ENTRY }));
    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "d_offer", ...OPEN_FOR_ENTRY },
      data: { status: "DISMISSED" },
    });
    // One CAS for both WAITING and OFFERED, then the re-offer's flip.
    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => [call.where, call.data.status])).toEqual([
      [{ id: "wl_removed", businessId: "biz_1", status: { in: ["WAITING", "OFFERED"] } }, "REMOVED"],
      [{ id: "wl_next", businessId: "biz_1", status: "WAITING" }, "OFFERED"],
    ]);
    // Only a still-cancelled appointment's slot is re-offered.
    expect(mocks.tx.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "appt_1", businessId: "biz_1", status: "CANCELLED" } })
    );
    expect(mocks.tx.followUpDraft.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ waitlistEntryId: "wl_next", appointmentId: "appt_1" })] })
    );
  });

  it("locks the offer draft before the entry — the same order Skip, Declined, withdraw and expiry use", async () => {
    mocks.tx.followUpDraft.findMany.mockResolvedValueOnce([{ id: "d_offer", appointmentId: "appt_1" }]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.appointment.findFirst.mockResolvedValue(null);

    await removeWaitlistEntry({ id: "wl_removed", businessId: "biz_1", now: NOW });

    const draftWrite = mocks.tx.followUpDraft.updateMany.mock.invocationCallOrder[0];
    const entryWrite = mocks.tx.waitlistEntry.updateMany.mock.invocationCallOrder[0];
    expect(draftWrite).toBeLessThan(entryWrite);
  });

  it("re-offers the slot of an offer that landed on the entry while the remove waited for its lock", async () => {
    mocks.tx.followUpDraft.findMany
      .mockResolvedValueOnce([]) // nothing open when the remove started
      .mockResolvedValueOnce([{ id: "d_new", appointmentId: "appt_1" }]); // committed during the lock wait
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_next", "2026-02-01")]);

    expect(await removeWaitlistEntry({ id: "wl_removed", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "d_new" }), data: { status: "DISMISSED" } })
    );
    expect(mocks.tx.followUpDraft.createMany).toHaveBeenCalledTimes(1);
  });

  it("dismisses the offer but re-offers nothing when the appointment is no longer cancelled", async () => {
    mocks.tx.followUpDraft.findMany.mockResolvedValueOnce([{ id: "d_offer", appointmentId: "appt_1" }]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.appointment.findFirst.mockResolvedValue(null); // no longer CANCELLED

    expect(await removeWaitlistEntry({ id: "wl_removed", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("removes a WAITING entry with the same single CAS and no offer work", async () => {
    expect(await removeWaitlistEntry({ id: "wl_1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wl_1", businessId: "biz_1", status: { in: ["WAITING", "OFFERED"] } },
      data: { status: "REMOVED" },
    });
    expect(mocks.tx.followUpDraft.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalled();
  });

  it("is a clean no-op for an entry already gone: the transaction rolls back any dismissal and nothing is re-offered", async () => {
    mocks.tx.followUpDraft.findMany.mockResolvedValueOnce([{ id: "d_offer", appointmentId: "appt_1" }]);
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 0 }); // FILLED / REMOVED / not this business

    expect(await removeWaitlistEntry({ id: "wl_removed", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This waiting-list entry was already removed.",
    });
    // The transaction callback threw, so Prisma rolls the dismissal back.
    await expect(mocks.prisma.$transaction.mock.results[0].value).rejects.toThrow();
    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("retries once when Postgres aborts the transaction as a write conflict / deadlock (P2034)", async () => {
    mocks.prisma.$transaction
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict or a deadlock", {
          code: "P2034",
          clientVersion: "test",
        })
      )
      .mockImplementationOnce(async (cb: (client: unknown) => unknown) => cb(mocks.tx));

    expect(await removeWaitlistEntry({ id: "wl_1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry, surfacing the error to the caller", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("deadlock", { code: "P2034", clientVersion: "test" });
    mocks.prisma.$transaction.mockRejectedValue(conflict);

    await expect(removeWaitlistEntry({ id: "wl_1", businessId: "biz_1", now: NOW })).rejects.toBe(conflict);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe("retryOnWriteConflict", () => {
  const unknownError = (message: string) =>
    new Prisma.PrismaClientUnknownRequestError(message, { clientVersion: "test" });

  // What the pg driver adapter really throws for a Postgres deadlock (captured from a live run).
  const REAL_DEADLOCK =
    "Invalid `tx.waitlistEntry.update()` invocation\nError occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: \"40P01\", message: \"deadlock detected\", severity: \"ERROR\" }), transient: false })";

  it("retries once on a P2034 write conflict", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" }))
      .mockResolvedValueOnce("done");

    expect(await retryOnWriteConflict(run)).toBe("done");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retries once on a real deadlock, which the driver adapter reports as an unknown request error naming 40P01", async () => {
    const run = vi.fn().mockRejectedValueOnce(unknownError(REAL_DEADLOCK)).mockResolvedValueOnce("done");

    expect(await retryOnWriteConflict(run)).toBe("done");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("also recognises the deadlock by its text alone", async () => {
    const run = vi.fn().mockRejectedValueOnce(unknownError("ERROR: deadlock detected")).mockResolvedValueOnce("done");

    expect(await retryOnWriteConflict(run)).toBe("done");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry, surfacing the second failure", async () => {
    const second = unknownError(REAL_DEADLOCK);
    const run = vi.fn().mockRejectedValueOnce(unknownError(REAL_DEADLOCK)).mockRejectedValueOnce(second);

    await expect(retryOnWriteConflict(run)).rejects.toBe(second);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never retries or swallows anything else: other unknown errors, other known codes, plain errors", async () => {
    const errors = [
      unknownError("Error occurred during query execution: connection terminated unexpectedly"),
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }),
      new Prisma.PrismaClientKnownRequestError("a P2002 message that mentions deadlock detected", { code: "P2002", clientVersion: "test" }),
      new Error("deadlock detected"), // not a Prisma error at all
    ];

    for (const error of errors) {
      const run = vi.fn().mockRejectedValue(error);
      await expect(retryOnWriteConflict(run)).rejects.toBe(error);
      expect(run).toHaveBeenCalledTimes(1);
    }
  });
});
