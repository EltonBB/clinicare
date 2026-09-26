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
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { Prisma } from "@prisma/client";

import {
  expirePastSlotOffers,
  offerFreedSlot,
  removeWaitlistEntry,
  reofferFreedSlot,
  slotOfferBody,
  withdrawSlotOffers,
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
};

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

const originalTimeZone = process.env.APP_TIME_ZONE;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_TIME_ZONE = "Europe/Budapest";
  mocks.tx.business.findUniqueOrThrow.mockResolvedValue({ plan: "PRO" });
  mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.followUpDraft.createMany.mockResolvedValue({ count: 1 });
  mocks.tx.followUpDraft.findFirst.mockResolvedValue(null); // no live offer for the slot yet
  mocks.tx.followUpDraft.findMany.mockResolvedValue([]);
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
          dedupeKey: "SLOT_OFFER:appt_1:wl_1",
          body: "Hi Name wl_1, a slot has opened up on October 5, 2026 at 9:00 AM. Reply here if you'd like it.",
        },
      ],
      skipDuplicates: true,
    });
    expectOuterClientUntouched();
  });

  it("never offers the slot back to the client who cancelled it, to an archived client, or to an entry already offered it", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([]);

    await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW });

    expect(mocks.tx.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { not: "client_cancelling" },
          client: { isArchived: false, status: { not: "ARCHIVED" } },
          followUpDrafts: { none: { kind: "SLOT_OFFER", appointmentId: "appt_1" } },
        }),
      })
    );
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
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
        appointment: { status: "CANCELLED", startAt: { gt: NOW } },
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

  it("gives up after five claimed matches instead of walking the whole list", async () => {
    mocks.tx.waitlistEntry.findMany.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => candidateRow(`wl_${index}`, `2026-01-0${index + 1}`))
    );
    mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 0 });

    expect(await offerFreedSlot(tx, { businessId: "biz_1", cancelled: CANCELLED, now: NOW })).toBeNull();
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledTimes(5);
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
    mocks.tx.appointment.findFirst.mockResolvedValue(CANCELLED);
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([candidateRow("wl_next", "2026-02-01")]);

    const offered = await reofferFreedSlot(tx, {
      businessId: "biz_1",
      waitlistEntryId: "wl_declined",
      appointmentId: "appt_1",
      now: NOW,
    });

    expect(offered).toBe("wl_next");
    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => [call.where.id, call.data.status])).toEqual([
      ["wl_declined", "WAITING"],
      ["wl_next", "OFFERED"],
    ]);
    // Only a still-cancelled appointment in this workspace is re-offered.
    expect(mocks.tx.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "appt_1", businessId: "biz_1", status: "CANCELLED" } })
    );
    // The declined entry is excluded by the "already offered this slot" filter.
    expect(mocks.tx.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ followUpDrafts: { none: { kind: "SLOT_OFFER", appointmentId: "appt_1" } } }),
      })
    );
  });

  it("leaves the slot alone when the entry was booked or removed meanwhile", async () => {
    mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 0 });

    expect(
      await reofferFreedSlot(tx, { businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: "appt_1", now: NOW })
    ).toBeNull();
    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalled();
  });

  it("only releases when the appointment was deleted or reactivated", async () => {
    expect(
      await reofferFreedSlot(tx, { businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: null, now: NOW })
    ).toBeNull();

    mocks.tx.appointment.findFirst.mockResolvedValue(null); // no longer CANCELLED
    expect(
      await reofferFreedSlot(tx, { businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: "appt_1", now: NOW })
    ).toBeNull();

    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledTimes(2); // the two releases
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("releases but offers nothing when the slot has already passed", async () => {
    mocks.tx.appointment.findFirst.mockResolvedValue({ ...CANCELLED, startAt: new Date("2026-08-31T08:00:00.000Z") });

    expect(
      await reofferFreedSlot(tx, { businessId: "biz_1", waitlistEntryId: "wl_1", appointmentId: "appt_1", now: NOW })
    ).toBeNull();
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
    mocks.tx.appointment.findFirst.mockResolvedValue(CANCELLED);
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
    mocks.tx.appointment.findFirst.mockResolvedValue(CANCELLED);
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
