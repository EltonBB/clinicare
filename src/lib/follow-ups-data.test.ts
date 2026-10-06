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
    staffMember: { findFirst: vi.fn() },
    client: { findFirst: vi.fn() },
    business: { findUniqueOrThrow: vi.fn() },
    scheduleBlock: { findFirst: vi.fn() },
    businessHours: { findUnique: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { readFileSync } from "node:fs";

import { FollowUpDraftKind, Prisma } from "@prisma/client";

import { expireStaleFollowUpDrafts } from "@/lib/follow-up-generation";
import {
  bookSlotOffer,
  confirmFollowUpDraftDispatch,
  dismissFollowUpDraft,
  getPendingFollowUpDraftCount,
  listPendingFollowUpDrafts,
  markFollowUpDraftDelivered,
  markFollowUpDraftSent,
  OFFER_STAFF_UNAVAILABLE_ERROR,
  passSlotOffer,
  revertFollowUpDraftToPending,
  settleInterruptedFollowUpSends,
  SLOT_OUTSIDE_HOURS_ERROR,
} from "@/lib/follow-ups-data";
import { MAX_MESSAGE_BODY_LENGTH, MESSAGE_TOO_LONG_ERROR } from "@/lib/messaging/limits";

const NOW = new Date("2026-09-01T08:00:00.000Z");
const FREED_APPOINTMENT = {
  id: "appt_1",
  clientId: "client_cancelling",
  staffMemberId: null,
  title: "Checkup",
  startAt: new Date("2026-10-05T07:00:00.000Z"),
  endAt: new Date("2026-10-05T07:30:00.000Z"),
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
  mocks.tx.scheduleBlock.findFirst.mockResolvedValue(null); // no business-wide block by default
  mocks.tx.businessHours.findUnique.mockResolvedValue({ isOpen: true, startTime: "00:00", endTime: "23:59" }); // open all day by default
  mocks.tx.$executeRaw.mockResolvedValue(undefined);
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
    // To-one relation filter `{ is: ... }`: `is: null` matches a missing related
    // row, `is: {...}` a present one that meets the filter.
    if (typeof filter === "object" && filter !== null && "is" in filter) {
      const { is, ...rest } = filter as { is: Row | null };
      if (Object.keys(rest).length > 0) throw new Error(`unsupported relation filter on ${key}`);
      if (is === null) return value === null || value === undefined;
      return value !== null && value !== undefined && matchesWhere(value as Row, is);
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

const ALL_WORKFLOWS_ON = { rebookEnabled: true, paymentReminderEnabled: true, thankYouEnabled: true };

function draftRow(overrides: Row = {}): Row {
  return {
    id: "d_1",
    businessId: "biz_1",
    kind: "REBOOK",
    status: "PENDING",
    createdAt: new Date("2026-08-31T08:00:00.000Z"),
    body: "Draft message",
    sentAt: null,
    clientId: "client_1",
    appointmentId: null,
    appointment: null,
    paymentId: null,
    payment: null,
    waitlistEntryId: null,
    waitlistEntry: null,
    client: { isArchived: false, status: "ACTIVE", appointments: [], phone: "+38344000000", name: "Test Client" },
    business: { plan: "PRO", workflowSettings: ALL_WORKFLOWS_ON },
    ...overrides,
  };
}

const client = (overrides: Row = {}) => ({
  isArchived: false,
  status: "ACTIVE",
  appointments: [],
  phone: "+38344000000",
  name: "Test Client",
  ...overrides,
});

// Serves `rows` through the mocked Prisma calls the data layer makes, filtered by the real where-inputs.
function serveDrafts(rows: Row[]) {
  const pick = (where: Row) => rows.filter((row) => matchesWhere(row, where));
  mocks.prisma.followUpDraft.findMany.mockImplementation(async ({ where }: { where: Row }) => pick(where));
  mocks.prisma.followUpDraft.count.mockImplementation(async ({ where }: { where: Row }) => pick(where).length);
  mocks.prisma.followUpDraft.updateMany.mockImplementation(async ({ where }: { where: Row }) => ({
    count: pick(where).length,
  }));
  // markFollowUpDraftSent runs its flip and the client/body read inside one
  // prisma.$transaction (mocked above to call back with mocks.tx), so the
  // same in-memory rows are served through tx.followUpDraft too.
  mocks.tx.followUpDraft.updateMany.mockImplementation(async ({ where }: { where: Row }) => ({
    count: pick(where).length,
  }));
  mocks.tx.followUpDraft.findFirstOrThrow.mockImplementation(async ({ where }: { where: Row }) => {
    const [row] = pick(where);
    if (!row) throw new Error("no row matched (findFirstOrThrow)");
    const rowClient = (row.client as Row | null) ?? {};
    const rowAppointment = row.appointment as Row | null;
    return {
      id: row.id,
      body: row.body,
      kind: row.kind,
      clientId: row.clientId,
      client: { phone: rowClient.phone ?? null, name: rowClient.name ?? null },
      // A fixture without an end time is a half-hour slot.
      appointment: rowAppointment
        ? {
            startAt: rowAppointment.startAt,
            endAt: rowAppointment.endAt ?? new Date((rowAppointment.startAt as Date).getTime() + 30 * 60_000),
          }
        : null,
    };
  });
}

async function listedIds(businessId = "biz_1") {
  return (await listPendingFollowUpDrafts(businessId, NOW)).map((draft) => draft.id);
}

// One live and several stale variants of every kind. A stale draft must be
// hidden from the list and the count, and refused by Send, at once — not only
// after the hourly sweep retires it.
// `keptBySweep`: hidden from the list and refused by Send, yet NOT expired by
// the hourly sweep — a workflow the clinic switched Off. Its drafts come back if
// the workflow is switched on again (see workflowEnabledWhere).
const LIVENESS_CASES: Array<{ name: string; live: boolean; row: Row; keptBySweep?: boolean }> = [
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
  {
    name: "rebook, legacy Advanced plan (counts as Pro)",
    live: true,
    row: draftRow({ kind: "REBOOK", business: { plan: "ADVANCED", workflowSettings: ALL_WORKFLOWS_ON } }),
  },
  // The owner can switch the rebooking nudge Off; a workspace that never saved
  // its settings has it off by default (DEFAULT_WORKFLOW_SETTINGS).
  {
    name: "rebook, rebooking workflow since switched off",
    live: false,
    keptBySweep: true,
    row: draftRow({
      kind: "REBOOK",
      business: { plan: "PRO", workflowSettings: { ...ALL_WORKFLOWS_ON, rebookEnabled: false } },
    }),
  },
  {
    name: "rebook, no saved workflow settings (rebooking is off by default)",
    live: false,
    keptBySweep: true,
    row: draftRow({ kind: "REBOOK", business: { plan: "PRO", workflowSettings: null } }),
  },
  {
    name: "rebook, other workflows switched off (only this one counts)",
    live: true,
    row: draftRow({
      kind: "REBOOK",
      business: { plan: "PRO", workflowSettings: { rebookEnabled: true, paymentReminderEnabled: false, thankYouEnabled: false } },
    }),
  },

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
    name: "payment, payment-reminder workflow since switched off",
    live: false,
    keptBySweep: true,
    row: draftRow({
      kind: "PAYMENT",
      paymentId: "pay_1",
      payment: { status: "Unpaid" },
      business: { plan: "PRO", workflowSettings: { ...ALL_WORKFLOWS_ON, paymentReminderEnabled: false } },
    }),
  },
  // Codex #130: an Inactive/Archived client gets no automated outreach suggestion
  // of any kind - the rebooking nudge and slot offers already said so, and now the
  // payment reminder does too.
  {
    name: "payment, client archived",
    live: false,
    row: draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Unpaid" }, client: client({ isArchived: true }) }),
  },
  {
    name: "payment, client inactive",
    live: false,
    row: draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Unpaid" }, client: client({ status: "INACTIVE" }) }),
  },
  {
    name: "payment, client status archived",
    live: false,
    row: draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Unpaid" }, client: client({ status: "ARCHIVED" }) }),
  },
  {
    name: "payment, no saved workflow settings (payment reminders are on by default)",
    live: true,
    row: draftRow({
      kind: "PAYMENT",
      paymentId: "pay_1",
      payment: { status: "Unpaid" },
      business: { plan: "PRO", workflowSettings: null },
    }),
  },
  {
    name: "payment, only the other workflows switched off",
    live: true,
    row: draftRow({
      kind: "PAYMENT",
      paymentId: "pay_1",
      payment: { status: "Unpaid" },
      business: { plan: "PRO", workflowSettings: { rebookEnabled: false, paymentReminderEnabled: true, thankYouEnabled: false } },
    }),
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
    row: draftRow({ kind: "THANK_YOU", appointmentId: "appt_1", appointment: { status: "CANCELLED", startAt: PAST, staffMemberId: null } }),
  },
  { name: "thank-you, visit deleted", live: false, row: draftRow({ kind: "THANK_YOU", appointmentId: null, appointment: null }) },
  {
    name: "thank-you, client archived",
    live: false,
    row: draftRow({
      kind: "THANK_YOU",
      appointmentId: "appt_1",
      appointment: { status: "COMPLETED", startAt: PAST },
      client: client({ isArchived: true }),
    }),
  },
  {
    name: "thank-you, client inactive",
    live: false,
    row: draftRow({
      kind: "THANK_YOU",
      appointmentId: "appt_1",
      appointment: { status: "COMPLETED", startAt: PAST },
      client: client({ status: "INACTIVE" }),
    }),
  },
  {
    name: "thank-you, thank-you workflow since switched off",
    live: false,
    keptBySweep: true,
    row: draftRow({
      kind: "THANK_YOU",
      appointmentId: "appt_1",
      appointment: { status: "COMPLETED", startAt: PAST },
      business: { plan: "PRO", workflowSettings: { ...ALL_WORKFLOWS_ON, thankYouEnabled: false } },
    }),
  },
  {
    name: "thank-you, no saved workflow settings (thank-yous are on by default)",
    live: true,
    row: draftRow({
      kind: "THANK_YOU",
      appointmentId: "appt_1",
      appointment: { status: "COMPLETED", startAt: PAST },
      business: { plan: "PRO", workflowSettings: null },
    }),
  },
  {
    name: "thank-you, only the other workflows switched off",
    live: true,
    row: draftRow({
      kind: "THANK_YOU",
      appointmentId: "appt_1",
      appointment: { status: "COMPLETED", startAt: PAST },
      business: { plan: "PRO", workflowSettings: { rebookEnabled: false, paymentReminderEnabled: false, thankYouEnabled: true } },
    }),
  },

  {
    name: "slot offer, still open",
    live: true,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: { status: "CANCELLED", startAt: FUTURE, staffMemberId: null },
    }),
  },
  {
    name: "slot offer, slot has passed",
    live: false,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: { status: "CANCELLED", startAt: PAST, staffMemberId: null },
    }),
  },
  {
    name: "slot offer, appointment back on",
    live: false,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: { status: "CONFIRMED", startAt: FUTURE, staffMemberId: null },
    }),
  },
  {
    name: "slot offer, entry no longer holds it",
    live: false,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "WAITING" },
      appointmentId: "appt_2",
      appointment: { status: "CANCELLED", startAt: FUTURE, staffMemberId: null },
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
      appointment: { status: "CANCELLED", startAt: FUTURE, staffMemberId: null },
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
      appointment: { status: "CANCELLED", startAt: FUTURE, staffMemberId: null },
      client: client({ status: "INACTIVE" }),
    }),
  },
  // Codex #130 (round 8): the freed appointment's own assigned staff can go
  // inactive after the offer is already out — Book already refuses that
  // staff member, so an offer for it must stop being sendable at once too,
  // not linger until staff discover it failing at Book time.
  {
    name: "slot offer, assigned staff still active",
    live: true,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: {
        status: "CANCELLED",
        startAt: FUTURE,
        staffMemberId: "staff_1",
        staffMember: { isActive: true, status: "ACTIVE" },
      },
    }),
  },
  {
    name: "slot offer, assigned staff deactivated (isActive false)",
    live: false,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: {
        status: "CANCELLED",
        startAt: FUTURE,
        staffMemberId: "staff_1",
        staffMember: { isActive: false, status: "ACTIVE" },
      },
    }),
  },
  {
    name: "slot offer, assigned staff status INACTIVE",
    live: false,
    row: draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: {
        status: "CANCELLED",
        startAt: FUTURE,
        staffMemberId: "staff_1",
        staffMember: { isActive: true, status: "INACTIVE" },
      },
    }),
  },
];

describe("follow-ups data layer — which drafts are actionable", () => {
  it.each(LIVENESS_CASES)("$name: listed, counted and sendable only while live ($live)", async ({ live, row }) => {
    serveDrafts([row]);

    expect(await listedIds()).toEqual(live ? ["d_1"] : []);
    expect(await getPendingFollowUpDraftCount("biz_1", NOW)).toBe(live ? 1 : 0);
    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual(
      live
        ? {
            ok: true,
            draft: { id: "d_1", body: "Draft message", clientId: "client_1", clientName: "Test Client", phone: "+38344000000" },
          }
        : { ok: false, error: "This follow-up was already handled." }
    );
  });

  // The hourly sweep is the permanent version of the live filter: whatever the
  // list hides must be expired by the next sweep, or a hidden draft would hold
  // one of the business's 50 pending slots for its kind forever. Slot offers
  // have their own sweep (expirePastSlotOffers), so they're left out; so are the
  // drafts a switched-off workflow hides, which the next test covers.
  it.each(LIVENESS_CASES.filter(({ row, keptBySweep }) => row.kind !== "SLOT_OFFER" && !keptBySweep))(
    "$name: the hourly sweep expires it exactly when it isn't live",
    async ({ live, row }) => {
      serveDrafts([row]);

      expect(await expireStaleFollowUpDrafts(NOW)).toBe(live ? 0 : 1);
    }
  );

  // Switching a workflow Off hides and blocks its queued drafts at once, but the
  // sweep leaves them: the generators skip anything that already has a draft of
  // its kind, so an expired payment reminder would never be drafted again after
  // the owner switched the workflow back on, even for a payment still unpaid.
  it.each(LIVENESS_CASES.filter(({ keptBySweep }) => keptBySweep))(
    "$name: the hourly sweep leaves it pending, so it returns with the switch",
    async ({ row }) => {
      serveDrafts([row]);

      expect(await expireStaleFollowUpDrafts(NOW)).toBe(0);
    }
  );

  it("brings a switched-off workflow's queued draft back when the owner switches it on again", async () => {
    const row = draftRow({
      kind: "PAYMENT",
      paymentId: "pay_1",
      payment: { status: "Unpaid" },
      business: { plan: "PRO", workflowSettings: { ...ALL_WORKFLOWS_ON, paymentReminderEnabled: false } },
    });
    serveDrafts([row]);
    expect(await listedIds()).toEqual([]);
    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toMatchObject({ ok: false });

    row.business = { plan: "PRO", workflowSettings: ALL_WORKFLOWS_ON };

    expect(await listedIds()).toEqual(["d_1"]);
    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toMatchObject({ ok: true });
  });

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
        sentAt: NOW,
        waitlistEntry: { status: "OFFERED" },
        appointment: { status: "CANCELLED", startAt: FUTURE, staffMemberId: null },
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
        sentAt: NOW,
        waitlistEntry: { status: "OFFERED" },
        appointment: { status: "CANCELLED", startAt: FUTURE, staffMemberId: null },
      }),
    ]);

    expect(await getPendingFollowUpDraftCount("biz_1", NOW)).toBe(1);
  });

  it("stops counting a sent slot offer once its slot has passed", async () => {
    serveDrafts([
      draftRow({
        kind: "SLOT_OFFER",
        status: "SENT",
        sentAt: NOW,
        waitlistEntry: { status: "OFFERED" },
        appointment: { status: "CANCELLED", startAt: PAST, staffMemberId: null },
      }),
    ]);

    expect(await getPendingFollowUpDraftCount("biz_1", NOW)).toBe(0);
  });

  // Codex #130: Send marks a draft SENT before the message leaves. Until it has
  // (sentAt set), the offer must not be listed as sent — Book or Declined on it
  // could fill or re-offer the slot while its own send may still fail.
  it("neither lists nor counts a slot offer that is still being sent", async () => {
    serveDrafts([
      draftRow({
        kind: "SLOT_OFFER",
        status: "SENT",
        sentAt: null,
        waitlistEntry: { status: "OFFERED" },
        appointment: { status: "CANCELLED", startAt: FUTURE, staffMemberId: null },
      }),
    ]);

    expect(await listedIds()).toEqual([]);
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

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({
      ok: true,
      draft: { id: "d_1", body: "Draft message", clientId: "client_1", clientName: "Test Client", phone: "+38344000000" },
    });
    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "SENT", sentAt: null } })
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

// Codex #130: markFollowUpDraftSent checks the draft and commits the claim; the
// message is only handed to the provider after that, outside any transaction, so
// another request can invalidate the draft in the gap and the patient would still
// be sent it. confirmFollowUpDraftDispatch is the same check again, on the claimed
// draft, directly before the patient is contacted.
describe("confirmFollowUpDraftDispatch — the last check before a message leaves", () => {
  const SENT_DRAFT = { id: "d_1", body: "Draft message", clientId: "client_1", clientName: "Test Client", phone: "+38344000000" };
  // The claim has committed: the draft is SENT.
  const claimed = (row: Row): Row => ({ ...row, status: "SENT" });

  it.each(LIVENESS_CASES)("$name: still goes out only while live ($live)", async ({ live, row }) => {
    serveDrafts([claimed(row)]);

    expect(await confirmFollowUpDraftDispatch({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual(
      live ? { ok: true, draft: SENT_DRAFT } : { ok: false, error: "This follow-up was already handled." }
    );
  });

  // The exact gap: the claim saw a live draft and committed; then another request
  // changed what the draft is about. The claim's check can't see that.
  const slotOffer = () =>
    draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: { status: "CANCELLED", startAt: FUTURE, staffMemberId: null },
    });

  it.each([
    [
      "a payment is settled",
      () => draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Unpaid" } }),
      (row: Row) => {
        row.payment = { status: "Paid" };
      },
    ],
    [
      "the client books again",
      () => draftRow({ kind: "REBOOK" }),
      (row: Row) => {
        row.client = client({ appointments: [{ status: "CONFIRMED", startAt: FUTURE }] });
      },
    ],
    [
      "the visit is recorded as a no-show",
      () => draftRow({ kind: "THANK_YOU", appointmentId: "appt_1", appointment: { status: "COMPLETED", startAt: PAST } }),
      (row: Row) => {
        row.appointment = { status: "NO_SHOW", startAt: PAST };
      },
    ],
    [
      "the client is archived",
      () => draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Unpaid" } }),
      (row: Row) => {
        row.client = client({ isArchived: true });
      },
    ],
    [
      "the workflow is switched off",
      () => draftRow({ kind: "PAYMENT", paymentId: "pay_1", payment: { status: "Unpaid" } }),
      (row: Row) => {
        row.business = { plan: "PRO", workflowSettings: { ...ALL_WORKFLOWS_ON, paymentReminderEnabled: false } };
      },
    ],
    [
      "the cancelled slot is reactivated, which expires its offer",
      slotOffer,
      (row: Row) => {
        row.status = "EXPIRED";
        row.appointment = { status: "CONFIRMED", startAt: FUTURE, staffMemberId: null };
        row.waitlistEntry = { status: "WAITING" };
      },
    ],
    [
      "another booking fills the slot, which withdraws its offer",
      slotOffer,
      (row: Row) => {
        row.status = "EXPIRED";
        row.waitlistEntry = { status: "WAITING" };
      },
    ],
    [
      "staff book the offer for the patient meanwhile",
      slotOffer,
      (row: Row) => {
        row.waitlistEntry = { status: "FILLED" };
      },
    ],
    [
      "the workspace drops to Basic",
      slotOffer,
      (row: Row) => {
        row.business = { plan: "BASIC" };
      },
    ],
  ])("refuses a draft where, after the claim committed, %s", async (_label, make, invalidate) => {
    const row = make();
    serveDrafts([row]);

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toMatchObject({ ok: true });
    row.status = "SENT"; // the claim has committed
    invalidate(row); // another request commits before the message is handed over

    expect(await confirmFollowUpDraftDispatch({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });

  it("lets a draft nothing happened to go out, with the body and phone number as they are now", async () => {
    const row = draftRow();
    serveDrafts([row]);

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toMatchObject({ ok: true });
    row.status = "SENT";
    row.client = client({ phone: "+38344999999", name: "Renamed Client" }); // edited in the gap

    expect(await confirmFollowUpDraftDispatch({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({
      ok: true,
      draft: { ...SENT_DRAFT, clientName: "Renamed Client", phone: "+38344999999" },
    });
  });

  it("only ever confirms a claimed draft: one still PENDING is not sendable through it", async () => {
    serveDrafts([draftRow()]); // PENDING, live

    expect(await confirmFollowUpDraftDispatch({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });

  it.each(["DISMISSED", "EXPIRED"])("refuses a draft another request has since marked %s", async (status) => {
    serveDrafts([{ ...draftRow(), status }]);

    expect(await confirmFollowUpDraftDispatch({ id: "d_1", businessId: "biz_1", now: NOW })).toMatchObject({ ok: false });
  });

  it("never confirms another workspace's draft", async () => {
    serveDrafts([claimed(draftRow({ businessId: "biz_2" }))]);

    expect(await confirmFollowUpDraftDispatch({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });

  // The write changes nothing: it exists for the draft's row lock. A request that
  // is midway through retiring this very draft is waited for, and the draft is then
  // read as that request left it - a plain read would not see its uncommitted change.
  it("holds the claimed draft with a write that changes nothing", async () => {
    serveDrafts([claimed(draftRow())]);

    await confirmFollowUpDraftDispatch({ id: "d_1", businessId: "biz_1", now: NOW });

    const [write] = mocks.tx.followUpDraft.updateMany.mock.calls[0];
    expect(write.data).toEqual({ status: "SENT" });
    expect(write.where).toMatchObject({ id: "d_1", businessId: "biz_1", status: "SENT" });
  });

  it("checks a slot offer against the working hours again, and refuses it when the clinic has closed meanwhile", async () => {
    const row = claimed(slotOffer());
    row.appointment = { status: "CANCELLED", startAt: FUTURE, endAt: new Date(FUTURE.getTime() + 30 * 60_000), staffMemberId: null };
    serveDrafts([row]);
    mocks.tx.businessHours.findUnique.mockResolvedValue({ isOpen: false, startTime: "00:00", endTime: "23:59" });

    expect(await confirmFollowUpDraftDispatch({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: SLOT_OUTSIDE_HOURS_ERROR,
    });
  });
});

// Codex #130: the clinic's hours can be shortened, or a weekday closed, after an
// appointment was booked. The calendar would refuse the booking an offer for its
// cancelled slot invites, so the offer can no longer be sent. That needs the
// clinic's weekday and wall clock, so it is checked in Send's own transaction
// (not in the SQL liveness filter) and rolls the SENT flip back.
describe("markFollowUpDraftSent — a slot offer's working hours", () => {
  // Thursday 11:00-11:30 in Budapest (FUTURE is 09:00 UTC, CEST).
  const offer = () =>
    draftRow({
      kind: "SLOT_OFFER",
      waitlistEntry: { status: "OFFERED" },
      appointmentId: "appt_2",
      appointment: { status: "CANCELLED", startAt: FUTURE, endAt: new Date(FUTURE.getTime() + 30 * 60_000), staffMemberId: null },
    });

  function trackRollback() {
    const state = { rolledBack: false };
    mocks.prisma.$transaction.mockImplementation(async (cb: (client: unknown) => unknown) => {
      try {
        return await cb(mocks.tx);
      } catch (error) {
        state.rolledBack = true; // Prisma rolls an interactive transaction back when its callback throws
        throw error;
      }
    });
    return state;
  }

  it("sends an offer whose slot fits the hours, checking the hours of the slot's own weekday", async () => {
    serveDrafts([offer()]);
    mocks.tx.businessHours.findUnique.mockResolvedValue({ isOpen: true, startTime: "00:00", endTime: "23:59" });

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toMatchObject({ ok: true });
    // Thursday is 3 in the schedule's Monday=0 convention.
    expect(mocks.tx.businessHours.findUnique).toHaveBeenCalledWith({
      where: { businessId_weekday: { businessId: "biz_1", weekday: 3 } },
      select: { isOpen: true, startTime: true, endTime: true },
    });
  });

  it.each([
    ["the weekday is switched off", { isOpen: false, startTime: "00:00", endTime: "23:59" }],
    ["the weekday has no hours row", null],
    ["the clinic now opens after the slot starts", { isOpen: true, startTime: "12:00", endTime: "18:00" }],
    ["the clinic now closes before the slot ends", { isOpen: true, startTime: "07:00", endTime: "08:00" }],
  ])("refuses the offer, and rolls the SENT flip back, when %s", async (_label, hours) => {
    serveDrafts([offer()]);
    mocks.tx.businessHours.findUnique.mockResolvedValue(hours);
    const state = trackRollback();

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: SLOT_OUTSIDE_HOURS_ERROR,
    });
    expect(state.rolledBack).toBe(true);
    // A refusal is not a write conflict: no second attempt.
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("names a customer-facing way out and no provider", () => {
    expect(SLOT_OUTSIDE_HOURS_ERROR).toMatch(/working hours/i);
    expect(SLOT_OUTSIDE_HOURS_ERROR).not.toMatch(/baileys|twilio|supabase|prisma|openai/i);
  });

  // A thank-you is about a visit that already happened (its draft carries that
  // appointment too), so the clinic's hours today have nothing to say about it.
  it.each([
    ["a rebooking nudge", () => draftRow({ kind: "REBOOK" })],
    [
      "a thank-you for a past visit",
      () => draftRow({ kind: "THANK_YOU", appointmentId: "appt_1", appointment: { status: "COMPLETED", startAt: PAST } }),
    ],
  ])("doesn't look at the hours for %s, even with the clinic closed", async (_label, make) => {
    serveDrafts([make()]);
    mocks.tx.businessHours.findUnique.mockResolvedValue({ isOpen: false, startTime: "00:00", endTime: "23:59" });

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toMatchObject({ ok: true });
    expect(mocks.tx.businessHours.findUnique).not.toHaveBeenCalled();
  });

  it("still refuses an offer that is no longer live before it looks at the hours", async () => {
    serveDrafts([{ ...offer(), waitlistEntry: { status: "WAITING" } }]);

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toMatchObject({ ok: false });
    expect(mocks.tx.businessHours.findUnique).not.toHaveBeenCalled();
  });
});

// Codex #130: the SENT flip stores the edited body, and the messaging seam rejects an
// over-limit one only afterwards - so a failed send would put the draft back to
// Pending with the oversized text still stored, unsendable on every retry, and
// inflating every pending draft's response. The cap is enforced before the flip.
describe("markFollowUpDraftSent - an edited body over the messaging cap", () => {
  const liveRebook = () => draftRow({ kind: "REBOOK" });

  it("refuses a body one character over the cap before reading or writing anything", async () => {
    serveDrafts([liveRebook()]);

    const result = await markFollowUpDraftSent({
      id: "d_1",
      businessId: "biz_1",
      now: NOW,
      editedBody: "x".repeat(MAX_MESSAGE_BODY_LENGTH + 1),
    });

    expect(result).toEqual({ ok: false, error: MESSAGE_TOO_LONG_ERROR });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.followUpDraft.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("stores and sends a body of exactly the cap", async () => {
    serveDrafts([liveRebook()]);
    const editedBody = "x".repeat(MAX_MESSAGE_BODY_LENGTH);

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW, editedBody })).toMatchObject({ ok: true });

    const [flip] = mocks.tx.followUpDraft.updateMany.mock.calls[0];
    expect(flip.data).toMatchObject({ status: "SENT", body: editedBody });
  });

  it("refuses it for a slot offer too, before the working-hours read", async () => {
    serveDrafts([
      draftRow({
        kind: "SLOT_OFFER",
        waitlistEntry: { status: "OFFERED" },
        appointmentId: "appt_2",
        appointment: { status: "CANCELLED", startAt: FUTURE, staffMemberId: null },
      }),
    ]);

    const result = await markFollowUpDraftSent({
      id: "d_1",
      businessId: "biz_1",
      now: NOW,
      editedBody: "x".repeat(MAX_MESSAGE_BODY_LENGTH + 1),
    });

    expect(result).toEqual({ ok: false, error: MESSAGE_TOO_LONG_ERROR });
    expect(mocks.tx.businessHours.findUnique).not.toHaveBeenCalled();
  });

  it("sends the stored draft as it is when nothing was edited", async () => {
    serveDrafts([liveRebook()]);

    expect(await markFollowUpDraftSent({ id: "d_1", businessId: "biz_1", now: NOW })).toMatchObject({ ok: true });

    const [flip] = mocks.tx.followUpDraft.updateMany.mock.calls[0];
    expect(flip.data).not.toHaveProperty("body");
  });

  it("words the refusal for the customer, without naming a provider", () => {
    expect(MESSAGE_TOO_LONG_ERROR).toBe("The message is too long to send.");
    expect(MESSAGE_TOO_LONG_ERROR).not.toMatch(/baileys|twilio|supabase|prisma|openai|whatsapp/i);
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
      where: {
        id: "d1",
        businessId: "biz_1",
        kind: "SLOT_OFFER",
        status: "SENT",
        sentAt: { not: null },
        waitlistEntry: { status: "OFFERED" },
      },
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
  const SLOT_DETAILS = {
    title: "Checkup",
    staffMemberId: "staff_1",
    startAt: FUTURE,
    endAt: new Date(FUTURE.getTime() + 30 * 60_000),
  };
  const BOOKED = { ok: true, slot: { clientId: "client_1", ...SLOT_DETAILS } };

  // Book reads its own appointment by id; the overlap check asks for any OTHER
  // appointment in the slot. Serve each its own answer.
  const serveSlot = (slot: Record<string, unknown>, overlapping: Record<string, unknown> | null = null) =>
    mocks.tx.appointment.findFirst.mockImplementation(async ({ where }: { where: { id?: unknown } }) =>
      where.id === "appt_1" ? slot : overlapping
    );

  beforeEach(() => {
    mocks.tx.followUpDraft.findFirst.mockResolvedValue({ clientId: "client_1", appointmentId: "appt_1" });
    serveSlot(SLOT_DETAILS);
    mocks.tx.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
    mocks.tx.client.findFirst.mockResolvedValue({ id: "client_1" });
  });

  // The raw SQL each $executeRaw call ran, placeholders shown as "?".
  const rawQueries = () => mocks.tx.$executeRaw.mock.calls.map((call) => (call[0] as TemplateStringsArray).join("?"));

  it("locks the draft row first (a value-preserving guarded write), then flips the entry pinned to that draft still being SENT and still live — in one transaction", async () => {
    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual(BOOKED);

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    // The guard is scalar, so it is re-checked against the row's latest version after the lock wait.
    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", businessId: "biz_1", kind: "SLOT_OFFER", status: "SENT", sentAt: { not: null } },
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
            appointment: {
              status: "CANCELLED",
              startAt: { gt: NOW },
              OR: [{ staffMemberId: null }, { staffMember: { isActive: true, status: { not: "INACTIVE" } } }],
            },
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

  // Codex #130: read outside the transaction, the slot details went stale — an
  // edit of the cancelled booking or a deactivation of its clinician landing in
  // between let Book fill the entry from an old snapshot and hand the booking
  // form an old slot or an unavailable clinician.
  it("locks the appointment and then its clinician before reading them, and returns exactly what it booked", async () => {
    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual(BOOKED);

    expect(rawQueries()).toEqual([
      'SELECT 1 FROM "Client" WHERE "id" = ? FOR SHARE',
      'SELECT 1 FROM "Appointment" WHERE "id" = ? FOR SHARE',
      'SELECT 1 FROM "StaffMember" WHERE "id" = ? FOR SHARE',
      "SELECT pg_advisory_xact_lock(hashtext(?))",
      'SELECT 1 FROM "BusinessHours" WHERE "businessId" = ? AND "weekday" = ? FOR SHARE',
    ]);
    expect(mocks.tx.$executeRaw.mock.calls.map((call) => call.slice(1))).toEqual([
      ["client_1"],
      ["appt_1"],
      ["staff_1"],
      ["staff_1"],
      ["biz_1", 3], // FUTURE is a Thursday on the clinic's clock
    ]);
    // That day's hours are read only once their row is locked.
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[4]).toBeLessThan(
      mocks.tx.businessHours.findUnique.mock.invocationCallOrder[0]
    );
    const [clientLock, appointmentLock, staffLock] = mocks.tx.$executeRaw.mock.invocationCallOrder;
    expect(clientLock).toBeLessThan(mocks.tx.client.findFirst.mock.invocationCallOrder[0]);
    expect(appointmentLock).toBeLessThan(mocks.tx.appointment.findFirst.mock.invocationCallOrder[0]);
    expect(staffLock).toBeLessThan(mocks.tx.staffMember.findFirst.mock.invocationCallOrder[0]);
    expect(mocks.tx.staffMember.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.waitlistEntry.updateMany.mock.invocationCallOrder[0]
    );
    expect(mocks.tx.appointment.findFirst).toHaveBeenCalledWith({
      where: { id: "appt_1", businessId: "biz_1" },
      select: { title: true, staffMemberId: true, startAt: true, endAt: true },
    });
  });

  it("refuses, leaving the entry OFFERED, when the offer's clinician is no longer available", async () => {
    mocks.tx.staffMember.findFirst.mockResolvedValue(null);

    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: OFFER_STAFF_UNAVAILABLE_ERROR,
    });
    expect(mocks.tx.staffMember.findFirst).toHaveBeenCalledWith({
      where: { id: "staff_1", businessId: "biz_1", isActive: true, status: { not: "INACTIVE" } },
      select: { id: true },
    });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("books an unassigned slot without locking or checking any clinician", async () => {
    serveSlot({ ...SLOT_DETAILS, staffMemberId: null });

    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: true,
      slot: { clientId: "client_1", ...SLOT_DETAILS, staffMemberId: null },
    });
    expect(rawQueries()).toEqual([
      'SELECT 1 FROM "Client" WHERE "id" = ? FOR SHARE',
      'SELECT 1 FROM "Appointment" WHERE "id" = ? FOR SHARE',
      'SELECT 1 FROM "BusinessHours" WHERE "businessId" = ? AND "weekday" = ? FOR SHARE',
    ]);
    expect(mocks.tx.staffMember.findFirst).not.toHaveBeenCalled();
  });

  // Codex #130: a booking saved into the same clinician and time while Book
  // runs used to go unseen — the save's withdrawal only matches an OFFERED
  // entry, so a Book that filled it first left the patient "booked" into a slot
  // the booking form then refuses.
  it("takes the clinician's scheduling lock and refuses, leaving the entry OFFERED, when the slot has since been taken", async () => {
    serveSlot(SLOT_DETAILS, { id: "appt_competing" });

    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
    // The overlap check: the same clinician, the same slot, any live booking but this one.
    expect(mocks.tx.appointment.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        staffMemberId: "staff_1",
        status: { not: "CANCELLED" },
        id: { not: "appt_1" },
        startAt: { lt: SLOT_DETAILS.endAt },
        endAt: { gt: SLOT_DETAILS.startAt },
      },
      select: { id: true },
    });
    // Locked before it looks, so a save into the slot can't commit in between.
    const schedulingLock = mocks.tx.$executeRaw.mock.invocationCallOrder[3];
    expect(rawQueries()[3]).toBe("SELECT pg_advisory_xact_lock(hashtext(?))");
    expect(schedulingLock).toBeLessThan(mocks.tx.appointment.findFirst.mock.invocationCallOrder[1]);
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  // Codex #130: archiving or deleting the patient while Book runs — read
  // unlocked, Book could fill the entry for them (the archive's scan then
  // misses it) and hand the booking form a client it drops.
  it("share-locks the offered patient and refuses, leaving the entry OFFERED, when they're no longer bookable", async () => {
    mocks.tx.client.findFirst.mockResolvedValue(null);

    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
    expect(rawQueries()[0]).toBe('SELECT 1 FROM "Client" WHERE "id" = ? FOR SHARE');
    expect(mocks.tx.client.findFirst).toHaveBeenCalledWith({
      where: { id: "client_1", businessId: "biz_1", isArchived: false, status: { notIn: ["INACTIVE", "ARCHIVED"] } },
      select: { id: true },
    });
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.client.findFirst.mock.invocationCallOrder[0]
    );
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when a schedule block now covers the slot", async () => {
    mocks.tx.scheduleBlock.findFirst.mockResolvedValue({ id: "block_1" });

    expect((await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).ok).toBe(false);
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("refuses when the offer has lost its appointment (deleted since)", async () => {
    mocks.tx.followUpDraft.findFirst.mockResolvedValue({ clientId: "client_1", appointmentId: null });

    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
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

  // Codex #130: a slot outside the clinic's hours now is one the calendar's save
  // refuses, so Book must not mark the entry FILLED for it.
  describe("working hours", () => {
    const SLOT = { startAt: FUTURE, endAt: new Date(FUTURE.getTime() + 30 * 60_000) };

    it("books a slot that still fits the hours, reading them after the draft lock and before the entry flip", async () => {
      serveSlot({ ...SLOT_DETAILS, ...SLOT });

      expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
        ok: true,
        slot: { clientId: "client_1", ...SLOT_DETAILS, ...SLOT },
      });

      expect(mocks.tx.followUpDraft.findFirst).toHaveBeenCalledWith({
        where: { id: "d1", businessId: "biz_1" },
        select: { clientId: true, appointmentId: true },
      });
      expect(mocks.tx.businessHours.findUnique).toHaveBeenCalledWith({
        where: { businessId_weekday: { businessId: "biz_1", weekday: 3 } },
        select: { isOpen: true, startTime: true, endTime: true },
      });
      const [lock] = mocks.tx.followUpDraft.updateMany.mock.invocationCallOrder;
      const [hours] = mocks.tx.businessHours.findUnique.mock.invocationCallOrder;
      const [flip] = mocks.tx.waitlistEntry.updateMany.mock.invocationCallOrder;
      expect(lock).toBeLessThan(hours);
      expect(hours).toBeLessThan(flip);
    });

    it.each([
      ["the weekday is switched off", { isOpen: false, startTime: "00:00", endTime: "23:59" }],
      ["the weekday has no hours row", null],
      ["the clinic now opens after the slot starts", { isOpen: true, startTime: "12:00", endTime: "18:00" }],
      ["the clinic now closes before the slot ends", { isOpen: true, startTime: "07:00", endTime: "08:00" }],
    ])("refuses, leaving the entry OFFERED, when %s", async (_label, hours) => {
      serveSlot({ ...SLOT_DETAILS, ...SLOT });
      mocks.tx.businessHours.findUnique.mockResolvedValue(hours);

      expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
        ok: false,
        error: SLOT_OUTSIDE_HOURS_ERROR,
      });
      expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
    });

    it("leaves the hours alone when the draft itself is already settled", async () => {
      mocks.tx.followUpDraft.updateMany.mockResolvedValue({ count: 0 });

      expect(await bookSlotOffer({ id: "d1", businessId: "biz_1" })).toEqual({
        ok: false,
        error: "This slot offer is no longer available.",
      });
      expect(mocks.tx.businessHours.findUnique).not.toHaveBeenCalled();
    });
  });

  it("retries once when Postgres aborts it as a deadlock or write conflict", async () => {
    mocks.prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock", { code: "P2034", clientVersion: "test" })
    );

    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1" })).toEqual(BOOKED);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("surfaces an unrelated failure instead of swallowing it", async () => {
    const failure = new Error("connection reset");
    mocks.prisma.$transaction.mockRejectedValueOnce(failure);

    await expect(bookSlotOffer({ id: "d1", businessId: "biz_1" })).rejects.toBe(failure);
  });
});

// Codex #130: Send claims a draft (SENT, no sentAt) before its message leaves.
// Until the send has succeeded, nothing may treat the offer as delivered.
describe("a follow-up whose message is still being sent", () => {
  const offer = (overrides: Row = {}) =>
    draftRow({
      id: "d1",
      kind: "SLOT_OFFER",
      status: "SENT",
      sentAt: null,
      waitlistEntry: { status: "OFFERED" },
      appointment: { status: "CANCELLED", startAt: FUTURE, staffMemberId: null },
      ...overrides,
    });

  it("can't be booked or declined until it has been delivered", async () => {
    serveDrafts([offer()]);

    expect(await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
    expect(await passSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).toEqual({
      ok: false,
      error: "This slot offer is no longer available.",
    });
    expect(mocks.tx.waitlistEntry.updateMany).not.toHaveBeenCalled();
  });

  it("can be booked once delivered", async () => {
    serveDrafts([offer({ sentAt: NOW })]);
    mocks.tx.followUpDraft.findFirst.mockResolvedValue({ clientId: "client_1", appointmentId: "appt_1" });
    mocks.tx.client.findFirst.mockResolvedValue({ id: "client_1" });
    mocks.tx.appointment.findFirst.mockResolvedValue({ title: "Checkup", staffMemberId: null, startAt: FUTURE, endAt: FUTURE });

    expect((await bookSlotOffer({ id: "d1", businessId: "biz_1", now: NOW })).ok).toBe(true);
  });

  it("is put back to Pending on a failed send only while it is still being sent — a delivered one is never un-sent", async () => {
    mocks.prisma.followUpDraft.updateMany.mockResolvedValue({ count: 1 });

    await revertFollowUpDraftToPending({ id: "d1", businessId: "biz_1" });

    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", businessId: "biz_1", status: "SENT", sentAt: null },
      data: { status: "PENDING" },
    });
  });

  it("is recorded as delivered once its message left", async () => {
    mocks.prisma.followUpDraft.updateMany.mockResolvedValue({ count: 1 });

    await markFollowUpDraftDelivered({ id: "d1", businessId: "biz_1", now: NOW });

    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", businessId: "biz_1", status: "SENT", sentAt: null },
      data: { sentAt: NOW },
    });
  });

  it("is settled as sent by the hourly run once no send could still be running (2 minutes)", async () => {
    mocks.prisma.followUpDraft.updateMany.mockResolvedValue({ count: 3 });

    expect(await settleInterruptedFollowUpSends(NOW)).toBe(3);
    expect(mocks.prisma.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: { status: "SENT", sentAt: null, updatedAt: { lt: new Date(NOW.getTime() - 2 * 60 * 1000) } },
      data: { sentAt: NOW },
    });
  });
});
