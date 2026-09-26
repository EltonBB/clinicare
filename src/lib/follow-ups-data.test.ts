import { beforeEach, describe, expect, it, vi } from "vitest";

// Outer client and transaction client are separate objects; the real
// slot-offer code (release + re-offer) runs against `tx`.
const mocks = vi.hoisted(() => ({
  prisma: {
    followUpDraft: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: {
    followUpDraft: { updateMany: vi.fn(), findFirstOrThrow: vi.fn(), findFirst: vi.fn(), createMany: vi.fn() },
    waitlistEntry: { findMany: vi.fn(), updateMany: vi.fn() },
    appointment: { findFirst: vi.fn() },
    business: { findUniqueOrThrow: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { Prisma } from "@prisma/client";

import {
  dismissFollowUpDraft,
  getPendingFollowUpDraftCount,
  listPendingFollowUpDrafts,
  markFollowUpDraftSent,
  passSlotOffer,
} from "@/lib/follow-ups-data";

const NOW = new Date("2026-09-01T08:00:00.000Z");
const LIVE_SLOT_OFFER = {
  kind: "SLOT_OFFER",
  waitlistEntry: { status: "OFFERED" },
  appointment: { status: "CANCELLED", startAt: { gt: NOW } },
};
const ACTIONABLE_PENDING = {
  status: "PENDING",
  OR: [{ kind: { not: "SLOT_OFFER" } }, LIVE_SLOT_OFFER],
};
const FREED_APPOINTMENT = {
  id: "appt_1",
  clientId: "client_cancelling",
  staffMemberId: null,
  title: "Checkup",
  startAt: new Date("2026-10-05T07:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (cb: (client: unknown) => unknown) => cb(mocks.tx));
  mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.followUpDraft.createMany.mockResolvedValue({ count: 1 });
  mocks.tx.business.findUniqueOrThrow.mockResolvedValue({ plan: "PRO" });
  mocks.tx.followUpDraft.findFirst.mockResolvedValue(null); // no other live offer for the slot
});

describe("follow-ups data layer", () => {
  it("counts PENDING drafts scoped to the business, hiding stale slot offers", async () => {
    mocks.prisma.followUpDraft.count.mockResolvedValue(3);
    await getPendingFollowUpDraftCount("biz_1", NOW);
    expect(mocks.prisma.followUpDraft.count).toHaveBeenCalledWith({ where: { businessId: "biz_1", ...ACTIONABLE_PENDING } });
  });

  it("lists actionable PENDING drafts plus live SENT slot offers, scoped to the business", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([]);
    await listPendingFollowUpDrafts("biz_1", NOW);
    expect(mocks.prisma.followUpDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz_1",
          OR: [ACTIONABLE_PENDING, { status: "SENT", ...LIVE_SLOT_OFFER }],
        },
      })
    );
  });

  it("caps the pending-drafts query at MAX_PENDING_FOLLOW_UPS (200) instead of querying unbounded", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([]);
    await listPendingFollowUpDrafts("biz_1");
    expect(mocks.prisma.followUpDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 })
    );
  });

  it("flips PENDING to SENT atomically (never a stale slot offer) and reports a plain error if it was already handled", async () => {
    mocks.prisma.followUpDraft.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await markFollowUpDraftSent({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", businessId: "biz_1", ...ACTIONABLE_PENDING },
      data: { status: "SENT", sentAt: NOW },
    });

    mocks.prisma.followUpDraft.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await markFollowUpDraftSent({ id: "d1", businessId: "biz_1" })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });
});

describe("dismissFollowUpDraft (Skip)", () => {
  it("dismisses a non-slot-offer draft and touches nothing else", async () => {
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({ kind: "REBOOK", waitlistEntryId: null, appointmentId: null });

    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", businessId: "biz_1", status: "PENDING" },
      data: { status: "DISMISSED" },
    });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("retries once when Postgres aborts the skip as a write conflict / deadlock (P2034)", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock", { code: "P2034", clientVersion: "test" })
    );
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({ kind: "REBOOK", waitlistEntryId: null, appointmentId: null });

    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("reports a plain error, and re-offers nothing, when the draft was already handled", async () => {
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 0 });

    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("skipping a slot offer releases the entry and offers the same slot to the next match, in one transaction", async () => {
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({
      kind: "SLOT_OFFER",
      waitlistEntryId: "wl_skipped",
      appointmentId: "appt_1",
    });
    mocks.tx.appointment.findFirst.mockResolvedValue(FREED_APPOINTMENT);
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([
      {
        id: "wl_next",
        clientId: "client_next",
        service: "Checkup",
        staffMemberId: null,
        earliestDate: null,
        preferredDays: [],
        preferredFrom: null,
        preferredTo: null,
        createdAt: new Date("2026-02-01"),
        client: { name: "Next" },
      },
    ]);

    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.waitlistEntry.updateMany.mock.calls.map(([call]) => [call.where.id, call.data.status])).toEqual([
      ["wl_skipped", "WAITING"],
      ["wl_next", "OFFERED"],
    ]);
    expect(mocks.tx.followUpDraft.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ waitlistEntryId: "wl_next", clientId: "client_next", appointmentId: "appt_1" })],
      })
    );
  });

  it("skipping a slot offer whose slot has passed just releases the entry", async () => {
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({
      kind: "SLOT_OFFER",
      waitlistEntryId: "wl_skipped",
      appointmentId: "appt_1",
    });
    mocks.tx.appointment.findFirst.mockResolvedValue({ ...FREED_APPOINTMENT, startAt: new Date("2026-08-01T07:00:00.000Z") });

    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });
});

describe("passSlotOffer (Declined)", () => {
  it("retires only a SENT slot offer whose entry still holds it, then releases and re-offers", async () => {
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({ waitlistEntryId: "wl_declined", appointmentId: "appt_1" });
    mocks.tx.appointment.findFirst.mockResolvedValue(FREED_APPOINTMENT);
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([]); // nobody else fits

    expect(await passSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });

    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", businessId: "biz_1", kind: "SLOT_OFFER", status: "SENT", waitlistEntry: { status: "OFFERED" } },
      data: { status: "DISMISSED" },
    });
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wl_declined", businessId: "biz_1", status: "OFFERED" },
      data: { status: "WAITING" },
    });
    expect(mocks.tx.waitlistEntry.findMany).toHaveBeenCalled(); // the re-offer ran
  });

  it("on a workspace that dropped to Basic, still releases the entry but drafts no re-offer", async () => {
    mocks.tx.business.findUniqueOrThrow.mockResolvedValue({ plan: "BASIC" });
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({ waitlistEntryId: "wl_declined", appointmentId: "appt_1" });
    mocks.tx.appointment.findFirst.mockResolvedValue(FREED_APPOINTMENT);

    expect(await passSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });

    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wl_declined", businessId: "biz_1", status: "OFFERED" },
      data: { status: "WAITING" },
    });
    expect(mocks.tx.waitlistEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("refuses an offer that isn't open anymore, without releasing anything", async () => {
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 0 });

    expect(await passSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });
});
