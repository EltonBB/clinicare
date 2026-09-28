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

import { readFileSync } from "node:fs";

import { FollowUpDraftKind, Prisma } from "@prisma/client";

import { expireStaleFollowUpDrafts } from "@/lib/follow-up-generation";
import {
  bookSlotOffer,
  dismissFollowUpDraft,
  getPendingFollowUpDraftCount,
  listPendingFollowUpDrafts,
  markFollowUpDraftSent,
  passSlotOffer,
} from "@/lib/follow-ups-data";

const NOW = new Date("2026-09-01T08:00:00.000Z");
const FREED_APPOINTMENT = {
  id: "appt_1",
  clientId: "client_cancelling",
  staffMemberId: null,
  title: "Checkup",
  startAt: new Date("2026-10-05T07:00:00.000Z"),
  updatedAt: new Date("2026-09-01T07:30:00.000Z"), // when it was cancelled
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

// A minimal in-memory reading of the Prisma where-inputs the data layer
// builds, so these tests check which drafts actually pass the filters — not
// just the filters' shape. Covers equality, in/notIn/not/gt/gte/lt/lte,
// OR/AND, to-one relation filters (a null relation never matches, as in
// Prisma) and to-many some/none. Anything else throws rather than passing.
type Row = Record<string, unknown>;
const SCALAR_OPERATORS = new Set(["in", "notIn", "not", "gt", "gte", "lt", "lte"]);

const comparable = (value: unknown) => (value instanceof Date ? value.getTime() : value);

function isScalarFilter(filter: unknown): boolean {
  return (
    filter === null ||
    typeof filter !== "object" ||
    filter instanceof Date ||
    Object.keys(filter).every((key) => SCALAR_OPERATORS.has(key))
  );
}

function matchesScalar(value: unknown, filter: unknown): boolean {
  if (filter === null || typeof filter !== "object" || filter instanceof Date) {
    return comparable(value) === comparable(filter);
  }
  const current = comparable(value) as number;
  return Object.entries(filter).every(([operator, operand]) => {
    const target = comparable(operand) as number;
    switch (operator) {
      case "in":
        return (operand as unknown[]).map(comparable).includes(current);
      case "notIn":
        return !(operand as unknown[]).map(comparable).includes(current);
      case "not":
        return !matchesScalar(value, operand);
      case "gt":
        return current > target;
      case "gte":
        return current >= target;
      case "lt":
        return current < target;
      case "lte":
        return current <= target;
      default:
        throw new Error(`unsupported operator ${operator}`);
    }
  });
}

function matchesWhere(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, filter]) => {
    if (key === "OR") return (filter as Row[]).some((branch) => matchesWhere(row, branch));
    if (key === "AND") return [filter].flat().every((branch) => matchesWhere(row, branch as Row));
    // Prisma's NOT negates a single where-input, or (given an array) negates
    // each one individually, ANDed together — same shape as AND above, just
    // inverted.
    if (key === "NOT") return [filter].flat().every((branch) => !matchesWhere(row, branch as Row));
    const value = row[key];
    if (isScalarFilter(filter)) return matchesScalar(value, filter);
    if (Array.isArray(value)) {
      const { some, none, ...rest } = filter as { some?: Row; none?: Row };
      if (Object.keys(rest).length > 0) throw new Error(`unsupported to-many filter on ${key}`);
      if (some) return value.some((related) => matchesWhere(related, some));
      if (none) return !value.some((related) => matchesWhere(related, none));
    }
    return value !== null && value !== undefined && matchesWhere(value as Row, filter as Row);
  });
}

const FUTURE = new Date("2026-09-10T09:00:00.000Z");
const PAST = new Date("2026-08-20T09:00:00.000Z"); // 12 days before NOW
// Outside the 28-day "recent visit" window a rebook draft is checked against (NOW - 28d = 2026-08-04T08:00Z).
const LONG_AGO = new Date("2026-07-20T09:00:00.000Z");
const WINDOW_EDGE = new Date(NOW.getTime() - 28 * 24 * 3_600_000);
const JUST_INSIDE_WINDOW = new Date(WINDOW_EDGE.getTime() + 60_000);

function draftRow(overrides: Row = {}): Row {
  return {
    id: "d_1",
    businessId: "biz_1",
    kind: "REBOOK",
    status: "PENDING",
    createdAt: new Date("2026-08-31T08:00:00.000Z"),
    appointmentId: null,
    appointment: null,
    paymentId: null,
    payment: null,
    waitlistEntryId: null,
    waitlistEntry: null,
    client: { isArchived: false, status: "ACTIVE", appointments: [] },
    business: { plan: "PRO" },
    ...overrides,
  };
}

const client = (overrides: Row = {}) => ({ isArchived: false, status: "ACTIVE", appointments: [], ...overrides });

// Serves `rows` through the mocked Prisma calls the data layer makes, filtered by the real where-inputs.
function serveDrafts(rows: Row[]) {
  const pick = (where: Row) => rows.filter((row) => matchesWhere(row, where));
  mocks.prisma.followUpDraft.findMany.mockImplementation(async ({ where }: { where: Row }) => pick(where));
  mocks.prisma.followUpDraft.count.mockImplementation(async ({ where }: { where: Row }) => pick(where).length);
  mocks.prisma.followUpDraft.updateMany.mockImplementation(async ({ where }: { where: Row }) => ({
    count: pick(where).length,
  }));
}

async function listedIds(businessId = "biz_1") {
  return (await listPendingFollowUpDrafts(businessId, NOW)).map((draft) => draft.id);
}

// One live and several stale variants of every kind. A stale draft must be
// hidden from the list and the count, and refused by Send, at once — not only
// after the hourly sweep retires it.
const LIVENESS_CASES: Array<{ name: string; live: boolean; row: Row }> = [
  { name: "rebook, client still lapsed", live: true, row: draftRow({ kind: "REBOOK" }) },
  {
    name: "rebook, client's only visit is older than 28 days (confirmed)",
    live: true,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "CONFIRMED", startAt: LONG_AGO }] }) }),
  },
  {
    name: "rebook, client's only visit is older than 28 days (completed)",
    live: true,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "COMPLETED", startAt: LONG_AGO }] }) }),
  },
  {
    name: "rebook, client's visit sits exactly on the 28-day edge",
    live: true,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "COMPLETED", startAt: WINDOW_EDGE }] }) }),
  },
  {
    name: "rebook, client's upcoming booking was cancelled",
    live: true,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "CANCELLED", startAt: FUTURE }] }) }),
  },
  {
    name: "rebook, client's recent appointment was cancelled",
    live: true,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "CANCELLED", startAt: PAST }] }) }),
  },
  {
    name: "rebook, client's recent appointment was a no-show",
    live: true,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "NO_SHOW", startAt: PAST }] }) }),
  },
  {
    name: "rebook, client was back within 28 days (completed walk-in)",
    live: false,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "COMPLETED", startAt: PAST }] }) }),
  },
  {
    name: "rebook, client was back within 28 days (confirmed)",
    live: false,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "CONFIRMED", startAt: PAST }] }) }),
  },
  {
    name: "rebook, client's visit is just inside the 28-day window",
    live: false,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "COMPLETED", startAt: JUST_INSIDE_WINDOW }] }) }),
  },
  {
    name: "rebook, client has since booked (confirmed)",
    live: false,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "CONFIRMED", startAt: FUTURE }] }) }),
  },
  {
    name: "rebook, client has since booked (pending)",
    live: false,
    row: draftRow({ kind: "REBOOK", client: client({ appointments: [{ status: "PENDING", startAt: FUTURE }] }) }),
  },
  { name: "rebook, client archived", live: false, row: draftRow({ kind: "REBOOK", client: client({ isArchived: true }) }) },
  { name: "rebook, client inactive", live: false, row: draftRow({ kind: "REBOOK", client: client({ status: "INACTIVE" }) }) },
  { name: "rebook, client status archived", live: false, row: draftRow({ kind: "REBOOK", client: client({ status: "ARCHIVED" }) }) },
  // Rebooking nudges are Pro: a downgrade stops them at once, not after the hourly sweep.
  { name: "rebook, workspace since dropped to Basic", live: false, row: draftRow({ kind: "REBOOK", business: { plan: "BASIC" } }) },
  { name: "rebook, legacy Advanced plan (counts as Pro)", live: true, row: draftRow({ kind: "REBOOK", business: { plan: "ADVANCED" } }) },

  { name: "payment, still unpaid", live: true, row: draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Unpaid" } }) },
  {
    name: "payment, partially paid",
    live: true,
    row: draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Partially Paid" } }),
  },
  { name: "payment, since marked paid", live: false, row: draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Paid" } }) },
  { name: "payment, since refunded", live: false, row: draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Refunded" } }) },
  { name: "payment, entry deleted", live: false, row: draftRow({ kind: "PAYMENT", paymentId: null, payment: null }) },
  {
    name: "payment, Basic workspace (payment reminders are on every plan)",
    live: true,
    row: draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Unpaid" }, business: { plan: "BASIC" } }),
  },

  {
    name: "thank-you, visit still completed",
    live: true,
    row: draftRow({ kind: "THANK_YOU", appointmentId: "appt_1", appointment: { status: "COMPLETED", startAt: PAST } }),
  },
  {
    name: "thank-you, visit since recorded as a no-show",
    live: false,
    row: draftRow({ kind: "THANK_YOU", appointmentId: "appt_1", appointment: { status: "NO_SHOW", startAt: PAST } }),
  },
  {
    name: "thank-you, visit reverted to confirmed",
    live: false,
    row: draftRow({ kind: "THANK_YOU", appointmentId: "appt_1", appointment: { status: "CONFIRMED", startAt: PAST } }),
  },
  {
    name: "thank-you, visit cancelled",
    live: false,
    row: draftRow({ kind: "THANK_YOU", appointmentId: "appt_1", appointment: { status: "CANCELLED", startAt: PAST } }),
  },
  { name: "thank-you, visit deleted", live: false, row: draftRow({ kind: "THANK_YOU", appointmentId: null, appointment: null }) },

  {
    name: "slot offer, still open",
    live: true,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: { status: "CANCELLED", startAt: FUTURE },
    }),
  },
  {
    name: "slot offer, slot has passed",
    live: false,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: { status: "CANCELLED", startAt: PAST },
    }),
  },
  {
    name: "slot offer, appointment back on",
    live: false,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: { status: "CONFIRMED", startAt: FUTURE },
    }),
  },
  {
    name: "slot offer, entry no longer holds it",
    live: false,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "WAITING" },
      appointmentId: "appt_2",
      appointment: { status: "CANCELLED", startAt: FUTURE },
    }),
  },
  // Codex #130: the waiting client can be archived/deactivated after already
  // receiving a slot-offer draft — an archived client can't be booked at all
  // (the booking form's picker refuses them), so an offer to one must stop
  // being sendable at once, not linger until Book fails confusingly.
  {
    name: "slot offer, waiting client archived",
    live: false,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: { status: "CANCELLED", startAt: FUTURE },
      client: client({ isArchived: true }),
    }),
  },
  {
    name: "slot offer, waiting client deactivated",
    live: false,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: { status: "CANCELLED", startAt: FUTURE },
      client: client({ status: "INACTIVE" }),
    }),
  },
];

describe("follow-ups data layer — which drafts are actionable", () => {
  it.each(LIVENESS_CASES)("$name: listed, counted and sendable only while live ($live)", async ({ live, row }) => {
    serveDrafts([row]);

    expect(await listedIds()).toEqual(live ? ["d_1"] : []);
    expect(await getPendingFollowUpDraftCount("biz_1", NOW)).toBe(live ? 1 : 0);
    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual(
      live ? { ok: true } : { ok: false, error: "This follow-up was already handled." }
    );
  });

  // The hourly sweep is the permanent version of the live filter: whatever the
  // list hides must be expired by the next sweep, or a hidden draft would hold
  // one of the business's 50 pending slots for its kind forever. Slot offers
  // have their own sweep (expirePastSlotOffers), so they're left out.
  it.each(LIVENESS_CASES.filter(({ row }) => row.kind !== "SLOT_OFFER"))(
    "$name: the hourly sweep expires it exactly when it isn't live",
    async ({ live, row }) => {
      serveDrafts([row]);

      expect(await expireStaleFollowUpDrafts(NOW)).toBe(live ? 0 : 1);
    }
  );

  it("keeps the count in step with the list — sent-but-live slot offers included — scoped to the business", async () => {
    const pendingRows = LIVENESS_CASES.map(({ row }, index) => ({ ...row, id: `d_${index}` }));
    serveDrafts([
      ...pendingRows,
      // Live, but another workspace's.
      draftRow({ id: "d_other_business", businessId: "biz_2" }),
      // Handled already: a sent rebook nudge has nothing left to do here.
      draftRow({ id: "d_sent_rebook", status: "SENT" }),
      // A sent offer staff can still book — listed and counted, or the Inbox's
      // only link to the page would vanish while it waits on them.
      draftRow({
        id: "d_sent_offer",
        kind: "SLOT_OFFER",
        status: "SENT",
        waitlistEntry: { status: "OFFERED" },
        appointment: { status: "CANCELLED", startAt: FUTURE },
      }),
    ]);

    const listed = await listPendingFollowUpDrafts("biz_1", NOW);
    const livePendingIds = LIVENESS_CASES.flatMap(({ live }, index) => (live ? [`d_${index}`] : []));

    expect(listed.map((draft) => draft.id).sort()).toEqual([...livePendingIds, "d_sent_offer"].sort());
    expect(await getPendingFollowUpDraftCount("biz_1", NOW)).toBe(listed.length);
    expect(await getPendingFollowUpDraftCount("biz_1", NOW)).toBe(livePendingIds.length + 1);
  });

  it("counts a lone sent slot offer, so the Inbox still links to the page", async () => {
    serveDrafts([
      draftRow({
        kind: "SLOT_OFFER",
        status: "SENT",
        waitlistEntry: { status: "OFFERED" },
        appointment: { status: "CANCELLED", startAt: FUTURE },
      }),
    ]);

    expect(await getPendingFollowUpDraftCount("biz_1", NOW)).toBe(1);
  });

  it("stops counting a sent slot offer once its slot has passed", async () => {
    serveDrafts([
      draftRow({
        kind: "SLOT_OFFER",
        status: "SENT",
        waitlistEntry: { status: "OFFERED" },
        appointment: { status: "CANCELLED", startAt: PAST },
      }),
    ]);

    expect(await getPendingFollowUpDraftCount("biz_1", NOW)).toBe(0);
  });

  it("re-checks liveness when Send flips the draft, so a page opened before the payment was recorded can't send", async () => {
    const row = draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Unpaid" } });
    serveDrafts([row]);
    expect(await listedIds()).toEqual(["d_1"]); // what the open page shows

    row.payment = { status: "Paid" }; // front desk records the payment

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });

  it("flips a live PENDING draft to SENT atomically and refuses a second flip", async () => {
    const row = draftRow();
    serveDrafts([row]);

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "SENT", sentAt: NOW } })
    );

    row.status = "SENT";
    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });

  it("never flips another workspace's draft", async () => {
    serveDrafts([draftRow({ businessId: "biz_2" })]);

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });
});

describe("follow-ups data layer — list order and cap", () => {
  it("lists slot offers first, then newest first, with a stable id tiebreaker", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([]);
    await listPendingFollowUpDrafts("biz_1", NOW);
    expect(mocks.prisma.followUpDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ kind: "asc" }, { createdAt: "desc" }, { id: "asc" }] })
    );
  });

  it("relies on SLOT_OFFER being the first declared kind, in the schema and in the migration Postgres sorts by", () => {
    expect(Object.values(FollowUpDraftKind)[0]).toBe("SLOT_OFFER");

    const migration = readFileSync(new URL("../../prisma/follow-up-draft-migration.sql", import.meta.url), "utf8");
    expect(migration).toMatch(/CREATE TYPE "FollowUpDraftKind" AS ENUM \('SLOT_OFFER',/);
  });

  it("caps the pending-drafts query at MAX_PENDING_FOLLOW_UPS (650 — the real structural ceiling: 150 for the three generated kinds' own 50-each cap, plus 500 for the waiting list's own cap on live slot offers) instead of querying unbounded", async () => {
    mocks.prisma.followUpDraft.findMany.mockResolvedValue([]);
    await listPendingFollowUpDrafts("biz_1");
    expect(mocks.prisma.followUpDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 650 })
    );
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

  it("rolls the skip back when the entry can't be released (booked or removed meanwhile): nothing stays dismissed, nothing is re-offered", async () => {
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({
      kind: "SLOT_OFFER",
      waitlistEntryId: "wl_skipped",
      appointmentId: "appt_1",
    });
    mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 0 }); // the release finds it no longer OFFERED

    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
    // The transaction callback threw, so Prisma rolls the dismissal back.
    await expect(mocks.prisma.$transaction.mock.results[0].value).rejects.toThrow();
    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("still dismisses a slot-offer draft whose entry is gone entirely (no entry to release)", async () => {
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({ kind: "SLOT_OFFER", waitlistEntryId: null, appointmentId: "appt_1" });

    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("retries the skip once on a real deadlock reported as an unknown request error", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientUnknownRequestError('PostgresError { code: "40P01", message: "deadlock detected" }', { clientVersion: "test" })
    );
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({ kind: "REBOOK", waitlistEntryId: null, appointmentId: null });

    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
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

  it("rolls the decline back when Book got to the entry first (it can't be released): the draft stays SENT, nothing is re-offered", async () => {
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({ waitlistEntryId: "wl_booked", appointmentId: "appt_1" });
    mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 0 }); // FILLED by Book, so no longer OFFERED

    expect(await passSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
    // The dismissal ran first, then the callback threw: Prisma rolls it back.
    await expect(mocks.prisma.$transaction.mock.results[0].value).rejects.toThrow();
    expect(mocks.tx.appointment.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("retries once on a P2034 conflict and on a real deadlock, and gives up after one retry", async () => {
    const deadlock = () =>
      new Prisma.PrismaClientUnknownRequestError('PostgresError { code: "40P01", message: "deadlock detected" }', { clientVersion: "test" });
    mocks.tx.followUpDraft.findFirstOrThrow.mockResolvedValue({ waitlistEntryId: "wl_declined", appointmentId: "appt_1" });
    mocks.tx.appointment.findFirst.mockResolvedValue(FREED_APPOINTMENT);
    mocks.tx.waitlistEntry.findMany.mockResolvedValue([]);

    mocks.prisma.$transaction.mockRejectedValueOnce(deadlock());
    expect(await passSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);

    vi.clearAllMocks();
    const second = deadlock();
    mocks.prisma.$transaction.mockRejectedValueOnce(deadlock()).mockRejectedValueOnce(second);
    await expect(passSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).rejects.toBe(second);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
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

describe("bookSlotOffer (Book)", () => {
  it("locks the draft row first (a value-preserving guarded write), then flips the entry pinned to that draft still being SENT and still live — in one transaction", async () => {
    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({ ok: true });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    // The guard is scalar, so it is re-checked against the row's latest version after the lock wait.
    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", businessId: "biz_1", kind: "SLOT_OFFER", status: "SENT" },
      data: { status: "SENT" },
    });
    // The entry flip re-checks liveSlotOfferWhere (kind, its own OFFERED
    // status, the appointment still cancelled and ahead, the client still
    // eligible) at the same moment it commits — not just that the draft is
    // still SENT — so a slot reactivated or filled elsewhere since the
    // caller's read now fails this write instead of silently marking the
    // entry FILLED with nothing booked (Codex #130).
    expect(mocks.tx.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        status: "OFFERED",
        followUpDrafts: {
          some: {
            id: "d1",
            kind: "SLOT_OFFER",
            waitlistEntry: { status: "OFFERED" },
            appointment: { status: "CANCELLED", startAt: { gt: NOW } },
            client: { isArchived: false, status: { notIn: ["INACTIVE", "ARCHIVED"] } },
          },
        },
      },
      data: { status: "FILLED" },
    });
    // Draft first, entry second — the lock order every other offer path uses.
    expect(mocks.tx.followUpDraft.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.waitlistEntry.updateMany.mock.invocationCallOrder[0]
    );
  });

  it("refuses without touching the entry when the draft was declined, skipped, expired or isn't a SENT slot offer any more", async () => {
    mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 0 });

    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1" })).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when the entry is no longer OFFERED, or the offer stopped being live (removed, booked by someone else, reactivated, or the client since archived/deactivated)", async () => {
    mocks.tx.waitlistEntry.updateMany.mockResolvedValue({ count: 0 });

    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1" })).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
  });

  it("retries once when Postgres aborts it as a deadlock or write conflict", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock", { code: "P2034", clientVersion: "test" })
    );

    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1" })).toEqual({ ok: true });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("surfaces an unrelated failure instead of swallowing it", async () => {
    const failure = new Error("connection reset");
    mocks.prisma.$transaction.mockRejectedValueOnce(failure);

    await expect(bookSlotOffer({ id: "d1", businessId: "biz_1" })).rejects.toBe(failure);
  });
});
