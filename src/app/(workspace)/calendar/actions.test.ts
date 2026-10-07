import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseZonedWallClock } from "@/lib/time-zone";

const mocks = vi.hoisted(() => {
  const appointment = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  };
  const client = { findFirst: vi.fn() };
  const staffMember = { findFirst: vi.fn() };
  const businessHours = { findUnique: vi.fn() };
  const appointmentReminder = { deleteMany: vi.fn() };
  const scheduleBlock = { findFirst: vi.fn() };
  const $executeRaw = vi.fn();
  const $transaction = vi.fn();
  const getAuthedBusiness = vi.fn();
  const toBusinessIdentity = vi.fn();
  const loadCalendarMonth = vi.fn();
  const refreshClientLastVisitAt = vi.fn();
  const notifyStaffOfAppointmentChange = vi.fn();
  const revalidateCalendarSurfaces = vi.fn();
  const recordAttendance = vi.fn();
  const getRiskAssessments = vi.fn();
  const offerFreedSlot = vi.fn();
  const withdrawSlotOffers = vi.fn();
  const cancelAppointmentCore = vi.fn();
  const deleteAppointmentCore = vi.fn();
  return {
    offerFreedSlot,
    withdrawSlotOffers,
    appointment,
    client,
    staffMember,
    businessHours,
    appointmentReminder,
    scheduleBlock,
    $executeRaw,
    $transaction,
    getAuthedBusiness,
    toBusinessIdentity,
    loadCalendarMonth,
    refreshClientLastVisitAt,
    notifyStaffOfAppointmentChange,
    revalidateCalendarSurfaces,
    recordAttendance,
    getRiskAssessments,
    cancelAppointmentCore,
    deleteAppointmentCore,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: mocks.appointment,
    client: mocks.client,
    staffMember: mocks.staffMember,
    businessHours: mocks.businessHours,
    appointmentReminder: mocks.appointmentReminder,
    scheduleBlock: mocks.scheduleBlock,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/business", () => ({
  getAuthedBusiness: mocks.getAuthedBusiness,
  toBusinessIdentity: mocks.toBusinessIdentity,
}));

vi.mock("@/lib/calendar-data", () => ({
  loadCalendarMonth: mocks.loadCalendarMonth,
}));

vi.mock("@/lib/no-show-risk-data", () => ({
  getNoShowRiskAssessments: mocks.getRiskAssessments,
}));

vi.mock("@/lib/slot-offers", () => ({
  offerFreedSlot: mocks.offerFreedSlot,
  withdrawSlotOffers: mocks.withdrawSlotOffers,
}));

vi.mock("@/lib/appointments-shared", async () => {
  // Real constant, mocked functions — so this suite always checks the
  // actual shared error string instead of a second hand-typed copy of it.
  const actual =
    await vi.importActual<typeof import("@/lib/appointments-shared")>("@/lib/appointments-shared");
  return {
    APPOINTMENT_ALREADY_COMPLETED_ERROR: actual.APPOINTMENT_ALREADY_COMPLETED_ERROR,
    APPOINTMENT_ALREADY_NO_SHOW_ERROR: actual.APPOINTMENT_ALREADY_NO_SHOW_ERROR,
    APPOINTMENT_CONFLICT_ERROR: actual.APPOINTMENT_CONFLICT_ERROR,
    APPOINTMENT_TIME_CONFLICT_ERROR: actual.APPOINTMENT_TIME_CONFLICT_ERROR,
    APPOINTMENT_CANCELLED_NO_SHOW_ERROR: actual.APPOINTMENT_CANCELLED_NO_SHOW_ERROR,
    APPOINTMENT_NOT_STARTED_ERROR: actual.APPOINTMENT_NOT_STARTED_ERROR,
    NO_SHOW_PLAN_ERROR: actual.NO_SHOW_PLAN_ERROR,
    cancelAppointmentCore: mocks.cancelAppointmentCore,
    deleteAppointmentCore: mocks.deleteAppointmentCore,
    recordAppointmentAttendanceCore: mocks.recordAttendance,
    refreshClientLastVisitAt: mocks.refreshClientLastVisitAt,
    notifyStaffOfAppointmentChange: mocks.notifyStaffOfAppointmentChange,
    revalidateCalendarSurfaces: mocks.revalidateCalendarSurfaces,
  };
});

// acquireSchedulingLock/hasSchedulingConflict now live in their own
// dependency-free module (@/lib/scheduling-conflicts) — not mocked at all,
// so the suite's assertions on the exact `where` shape run against the real
// query-construction logic, same as before it moved out of
// appointments-shared.ts (Codex #130).

import {
  cancelAppointmentAction,
  deleteAppointmentAction,
  getNoShowRiskAction,
  loadCalendarMonthAction,
  recordAppointmentAttendanceAction,
  saveAppointmentAction,
  type SaveAppointmentPayload,
} from "./actions";
import {
  APPOINTMENT_ALREADY_COMPLETED_ERROR,
  APPOINTMENT_ALREADY_NO_SHOW_ERROR,
  APPOINTMENT_CANCELLED_NO_SHOW_ERROR,
  APPOINTMENT_CONFLICT_ERROR,
  APPOINTMENT_NOT_STARTED_ERROR,
  APPOINTMENT_TIME_CONFLICT_ERROR,
  cancelAppointmentCore,
  deleteAppointmentCore,
  NO_SHOW_PLAN_ERROR,
} from "@/lib/appointments-shared";

const BUSINESS = { id: "biz_1", plan: "PRO" as const };
const EXISTING = {
  id: "appt_1",
  clientId: "client_1",
  staffMemberId: null,
  title: "Checkup",
  startAt: new Date("2026-06-01T09:00:00Z"),
  endAt: new Date("2026-06-01T09:30:00Z"),
  status: "CONFIRMED" as const,
};

// The slot fields a save reads before its transaction; its guarded write must still match them.
const READ_SLOT = {
  clientId: EXISTING.clientId,
  staffMemberId: EXISTING.staffMemberId,
  title: EXISTING.title,
  startAt: EXISTING.startAt,
  endAt: EXISTING.endAt,
};

const PAYLOAD: SaveAppointmentPayload = {
  id: "appt_1",
  clientId: "client_1",
  service: "Checkup",
  date: "2026-06-01",
  startTime: "09:00",
  endTime: "09:30",
  notes: "",
  status: "confirmed",
  baselineStatus: "confirmed",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedBusiness.mockResolvedValue({ business: BUSINESS, user: {} });
  mocks.client.findFirst.mockResolvedValue({ id: "client_1" });
  // Permissive "open all day" so the test's fixed date/time always passes,
  // independent of which real weekday it falls on.
  mocks.businessHours.findUnique.mockResolvedValue({
    isOpen: true,
    startTime: "00:00",
    endTime: "23:59",
  });
  mocks.appointment.findFirst.mockResolvedValue(EXISTING);
  // No overlap by default — tests for the conflict-detection path itself
  // override these to a truthy row.
  mocks.scheduleBlock.findFirst.mockResolvedValue(null);
  // No overlapping cancelled-with-a-live-offer appointment by default — the
  // slot-offer-withdrawal tests below override this to a real row.
  mocks.appointment.findMany.mockResolvedValue([]);
  mocks.$executeRaw.mockResolvedValue(undefined);
  mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      appointment: mocks.appointment,
      appointmentReminder: mocks.appointmentReminder,
      scheduleBlock: mocks.scheduleBlock,
      $executeRaw: mocks.$executeRaw,
    })
  );
});

describe("saveAppointmentAction — crafted id", () => {
  // Client-serialized args aren't type-checked at runtime, so a crafted
  // `{ not: "" }` for `payload.id` would otherwise reach a Prisma `where`
  // clause below as an edit-existing-row filter (Codex).
  it("rejects a non-string id before checking auth or touching the database", async () => {
    const result = await saveAppointmentAction({
      ...PAYLOAD,
      id: { not: "" } as unknown as string,
    });

    expect(result).toEqual({ ok: false, error: "Appointment not found in this clinic workspace." });
    expect(mocks.getAuthedBusiness).not.toHaveBeenCalled();
    expect(mocks.appointment.findFirst).not.toHaveBeenCalled();
  });
});

describe("saveAppointmentAction — concurrent-edit guard", () => {
  it("refuses to save over a row that changed since it was read, instead of silently overwriting it", async () => {
    // Simulates completePastConfirmedAppointments (or another editor) having
    // changed this row's status between the initial read above and this
    // save's write — the guarded updateMany matches 0 rows.
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });

    const result = await saveAppointmentAction(PAYLOAD);

    expect(result).toEqual({
      ok: false,
      error: APPOINTMENT_CONFLICT_ERROR,
    });
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "appt_1", businessId: "biz_1", status: "CONFIRMED", ...READ_SLOT },
      })
    );
    // Nothing downstream of the write should run for a refused save.
    expect(mocks.appointmentReminder.deleteMany).not.toHaveBeenCalled();
    expect(mocks.refreshClientLastVisitAt).not.toHaveBeenCalled();
    expect(mocks.notifyStaffOfAppointmentChange).not.toHaveBeenCalled();
    expect(mocks.revalidateCalendarSurfaces).not.toHaveBeenCalled();
  });

  it("saves normally when nothing changed the row underneath it", async () => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      id: "appt_1",
      clientId: "client_1",
      staffMemberId: null,
      startAt: EXISTING.startAt,
      endAt: EXISTING.endAt,
      notes: null,
      status: "CONFIRMED",
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    const result = await saveAppointmentAction(PAYLOAD);

    expect(result.ok).toBe(true);
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "appt_1", businessId: "biz_1", status: "CONFIRMED", ...READ_SLOT },
      })
    );
    // The edit page renders the status this save changes, so it is refreshed too.
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(
      ["client_1", "client_1"],
      [null, null],
      ["appt_1"]
    );
  });

  it("re-runs the save once when Postgres aborts its transaction as a deadlock", async () => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      id: "appt_1",
      clientId: "client_1",
      staffMemberId: null,
      startAt: EXISTING.startAt,
      endAt: EXISTING.endAt,
      notes: null,
      status: "CONFIRMED",
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });
    // The first attempt is the transaction Postgres picked as the deadlock
    // victim (the save takes the scheduling advisory lock before the rows
    // cancel and Skip lock first). Nothing in it survives; the retry runs the
    // whole save again against a clean slate.
    mocks.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock detected", { code: "P2034", clientVersion: "test" })
    );

    const result = await saveAppointmentAction(PAYLOAD);

    expect(result.ok).toBe(true);
    expect(mocks.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.appointment.updateMany).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failure that isn't a deadlock", async () => {
    mocks.$transaction.mockRejectedValueOnce(new Error("connection reset"));

    const result = await saveAppointmentAction(PAYLOAD);

    expect(result.ok).toBe(false);
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
  });

  it("guards on the client's baseline status, not a status re-read at submit time", async () => {
    // This is the regression this suite exists to catch: a naive guard that
    // re-reads the row's status inside this same call (instead of trusting
    // payload.baselineStatus) would already see whatever a concurrent sweep
    // just set — here, COMPLETED — and "successfully" match against THAT,
    // silently overwriting it with the stale form's CONFIRMED payload. The
    // fresh findFirst below (used only for the wasNewlyCancelled/
    // shouldResetReminders bookkeeping) reports COMPLETED; the payload's
    // baselineStatus ("confirmed", from before the sweep ran) must be what
    // actually reaches the guarded updateMany's WHERE clause.
    mocks.appointment.findFirst.mockResolvedValue({ ...EXISTING, status: "COMPLETED" });
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });

    const result = await saveAppointmentAction(PAYLOAD);

    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "appt_1", businessId: "biz_1", status: "CONFIRMED", ...READ_SLOT },
      })
    );
    expect(result).toEqual({
      ok: false,
      error: APPOINTMENT_CONFLICT_ERROR,
    });
  });

  it("lets a legitimate status change through — the guard matches the OLD status, not the NEW one being saved", async () => {
    // NOTE: every other test in this suite uses status === baselineStatus
    // (both "confirmed"), so they'd pass identically even if the guard were
    // wrongly keyed on payload.status instead of payload.baselineStatus —
    // this is the ONLY test with the two fields genuinely different. Do not
    // remove as "redundant" with the tests above.
    // The Status dropdown can move status to any value; the guard must
    // compare against baselineStatus (what the row was) and never against
    // payload.status (what it's being changed to), or every real status
    // change would falsely report a conflict against itself.
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      id: "appt_1",
      clientId: "client_1",
      staffMemberId: null,
      startAt: EXISTING.startAt,
      endAt: EXISTING.endAt,
      notes: null,
      status: "CANCELLED",
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      status: "cancelled",
      baselineStatus: "confirmed",
    });

    expect(result.ok).toBe(true);
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "appt_1", businessId: "biz_1", status: "CONFIRMED", ...READ_SLOT },
        data: expect.objectContaining({ status: "CANCELLED" }),
      })
    );
  });

  it("refuses to cancel an already-completed visit via the edit form, no race required", async () => {
    // Same business rule cancelAppointmentCore enforces (409) for the
    // dedicated Cancel button — a completed visit already happened, so this
    // must be refused outright, not just when a concurrent write races it.
    mocks.appointment.findFirst.mockResolvedValue({ ...EXISTING, status: "COMPLETED" });

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      status: "cancelled",
      baselineStatus: "completed",
    });

    expect(result).toEqual({
      ok: false,
      error: APPOINTMENT_ALREADY_COMPLETED_ERROR,
    });
    // Refused before any write is attempted.
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.revalidateCalendarSurfaces).not.toHaveBeenCalled();
  });

  it("still allows correcting an accidental auto-complete back to confirmed", async () => {
    // Only the COMPLETED -> CANCELLED destination is barred; other
    // corrections away from COMPLETED (e.g. undoing a mistaken auto-complete)
    // stay available.
    mocks.appointment.findFirst.mockResolvedValue({ ...EXISTING, status: "COMPLETED" });
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      id: "appt_1",
      clientId: "client_1",
      staffMemberId: null,
      startAt: EXISTING.startAt,
      endAt: EXISTING.endAt,
      notes: null,
      status: "CONFIRMED",
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      status: "confirmed",
      baselineStatus: "completed",
    });

    expect(result.ok).toBe(true);
  });
});

describe("saveAppointmentAction — cancelledAt: an immutable timestamp, not the auto-managed updatedAt", () => {
  beforeEach(() => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
  });

  it("sets cancelledAt on the transition into CANCELLED", async () => {
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      status: "CANCELLED",
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "confirmed" });

    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELLED",
          cancelledAt: expect.any(Date),
          // The schedule as of THIS cancel — this save's own startAt, since a
          // save can cancel and reschedule in one write.
          cancelledScheduledStartAt: parseZonedWallClock("2026-06-01", "09:00"),
        }),
      })
    );
  });

  it("clears cancelledAt and cancelledScheduledStartAt on the transition out of CANCELLED (un-cancel)", async () => {
    mocks.appointment.findFirst.mockResolvedValueOnce({ ...EXISTING, status: "CANCELLED" });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    await saveAppointmentAction({ ...PAYLOAD, status: "confirmed", baselineStatus: "cancelled" });

    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CONFIRMED", cancelledAt: null, cancelledScheduledStartAt: null }),
      })
    );
  });

  it("derives the cancel transition from payload.baselineStatus — what the compare-and-set guard actually matches — not a fresh re-read of the row (CodeRabbit)", async () => {
    // The fresh pre-transaction read (existing.status) sees CANCELLED — as if
    // someone else's write landed between it and this one — but the client's
    // own form, and so the CAS guard, is keyed on baselineStatus "confirmed".
    // The guard succeeding (count: 1, mocked below via updateMany's default)
    // proves the row's real state at write time WAS confirmed regardless of
    // what the earlier read saw, so this genuinely is a fresh cancellation.
    // The old logic (deriving the flag from existing.status) would have
    // missed it and skipped cancelledAt entirely.
    mocks.appointment.findFirst.mockResolvedValueOnce({ ...EXISTING, status: "CANCELLED" });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      status: "CANCELLED",
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "confirmed" });

    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "CONFIRMED" }), // guard keyed on baselineStatus, not the stale read
        data: expect.objectContaining({ cancelledAt: expect.any(Date) }),
      })
    );
  });

  it("leaves cancelledAt untouched on any other save — including editing a still-cancelled booking (this is the fix: the old code used the auto-managed updatedAt, which every such edit rewrites)", async () => {
    mocks.appointment.findFirst.mockResolvedValueOnce({ ...EXISTING, status: "CANCELLED" });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      status: "CANCELLED",
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "cancelled", notes: "called to reschedule" });

    // `cancelledAt: undefined` (not present, not overwritten with a new value)
    // — Prisma omits an undefined field from the update, so the real
    // cancellation time in the database is left exactly as it was.
    const call = mocks.appointment.updateMany.mock.calls[0][0];
    expect(call.data.cancelledAt).toBeUndefined();
    expect(call.data.cancelledScheduledStartAt).toBeUndefined();
  });

  it("leaves cancelledAt untouched on a plain confirmed -> confirmed save", async () => {
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    await saveAppointmentAction(PAYLOAD);

    const call = mocks.appointment.updateMany.mock.calls[0][0];
    expect(call.data.cancelledAt).toBeUndefined();
    expect(call.data.cancelledScheduledStartAt).toBeUndefined();
  });

  it("leaves the reminder generation alone when the save changes nothing reminders depend on", async () => {
    const startAt = parseZonedWallClock("2026-06-01", "09:00");
    const endAt = parseZonedWallClock("2026-06-01", "09:30");
    mocks.appointment.findFirst.mockResolvedValue({ ...EXISTING, startAt, endAt });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      startAt,
      endAt,
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    await saveAppointmentAction({ ...PAYLOAD, notes: "bring the referral" });

    expect(mocks.appointmentReminder.deleteMany).not.toHaveBeenCalled();
    expect(mocks.appointment.updateMany.mock.calls[0][0].data.reminderGeneration).toBeUndefined();
  });

  // Codex #133: a reset that doesn't move the booking (here, a new service)
  // still owes a new reminder, so it starts a new generation in the same write.
  it("starts a new reminder generation whenever the save resets the reminders", async () => {
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      title: "Cleaning",
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    await saveAppointmentAction({ ...PAYLOAD, service: "Cleaning" });

    expect(mocks.appointmentReminder.deleteMany).toHaveBeenCalledWith({ where: { appointmentId: "appt_1" } });
    expect(mocks.appointment.updateMany.mock.calls[0][0].data.reminderGeneration).toEqual({ increment: 1 });
  });
});

describe("saveAppointmentAction — the guarded write holds the slot it read", () => {
  // A save derives its flags (did the slot move, reset the reminders, withdraw
  // and re-offer a cancelled booking's offer) from a read made before its
  // transaction. If another save commits a different slot in between, those
  // flags describe a row that is gone, so the write must refuse instead of
  // overwriting it and skipping the follow-through - which would leave an open
  // offer promising the other save's details on a row that no longer has them
  // (Codex #130, round 22).
  const READ_ROW = {
    ...EXISTING,
    businessId: "biz_1",
    status: "CANCELLED" as const,
    startAt: parseZonedWallClock("2026-06-01", "09:00"),
    endAt: parseZonedWallClock("2026-06-01", "09:30"),
  };
  const UNCHANGED_CANCELLED_SAVE = { ...PAYLOAD, status: "cancelled" as const, baselineStatus: "cancelled" as const };

  // Stands in for Postgres matching the update's WHERE against the row as it is now.
  function currentRowIs(row: Record<string, unknown>) {
    mocks.appointment.updateMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => ({
      count: Object.entries(where).every(([field, wanted]) => {
        const actual = row[field];
        return wanted instanceof Date && actual instanceof Date ? wanted.getTime() === actual.getTime() : wanted === actual;
      })
        ? 1
        : 0,
    }));
  }

  beforeEach(() => {
    mocks.appointment.findFirst.mockResolvedValue(READ_ROW);
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...READ_ROW,
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });
  });

  afterEach(() => {
    mocks.appointment.updateMany.mockReset();
  });

  const CONCURRENT_CHANGES: Array<[string, Record<string, unknown>]> = [
    ["client", { clientId: "client_2" }],
    ["staff member", { staffMemberId: "staff_2" }],
    ["service", { title: "Cleaning" }],
    ["start time", { startAt: parseZonedWallClock("2026-06-01", "10:00") }],
    ["end time", { endAt: parseZonedWallClock("2026-06-01", "10:30") }],
  ];

  it.each(CONCURRENT_CHANGES)(
    "refuses to overwrite a still-cancelled booking whose %s another save just changed, and touches its offer not at all",
    async (_label, change) => {
      // The stale read says nothing moved (so no withdraw / re-offer is planned);
      // the row, though, already carries the other save's value.
      currentRowIs({ ...READ_ROW, ...change });

      const result = await saveAppointmentAction(UNCHANGED_CANCELLED_SAVE);

      expect(result).toEqual({ ok: false, error: APPOINTMENT_CONFLICT_ERROR });
      expect(mocks.withdrawSlotOffers).not.toHaveBeenCalled();
      expect(mocks.offerFreedSlot).not.toHaveBeenCalled();
      expect(mocks.appointmentReminder.deleteMany).not.toHaveBeenCalled();
      expect(mocks.refreshClientLastVisitAt).not.toHaveBeenCalled();
      expect(mocks.notifyStaffOfAppointmentChange).not.toHaveBeenCalled();
      expect(mocks.revalidateCalendarSurfaces).not.toHaveBeenCalled();
    }
  );

  it("refuses a plain confirmed save the same way, so the conflict check and reminder reset it skipped are never silently dropped", async () => {
    mocks.appointment.findFirst.mockResolvedValue({
      ...EXISTING,
      startAt: parseZonedWallClock("2026-06-01", "09:00"),
      endAt: parseZonedWallClock("2026-06-01", "09:30"),
    });
    currentRowIs({
      ...EXISTING,
      businessId: "biz_1",
      startAt: parseZonedWallClock("2026-06-01", "15:00"),
      endAt: parseZonedWallClock("2026-06-01", "15:30"),
    });

    const result = await saveAppointmentAction(PAYLOAD);

    expect(result).toEqual({ ok: false, error: APPOINTMENT_CONFLICT_ERROR });
    expect(mocks.appointmentReminder.deleteMany).not.toHaveBeenCalled();
    expect(mocks.revalidateCalendarSurfaces).not.toHaveBeenCalled();
  });

  it("saves normally when the row is still exactly as the save read it", async () => {
    currentRowIs(READ_ROW);

    const result = await saveAppointmentAction(UNCHANGED_CANCELLED_SAVE);

    expect(result.ok).toBe(true);
    expect(mocks.appointment.updateMany).toHaveBeenCalledTimes(1);
  });

  it("holds the values it READ, not the ones being saved, so an edit that changes every one of them still goes through", async () => {
    // The guard keeps the row's old client, staff member, service and window;
    // the data written holds the new ones. Using the payload's values in the
    // guard would make every real edit conflict with itself.
    mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_2" });
    mocks.client.findFirst.mockResolvedValue({ id: "client_2" });
    mocks.appointment.findFirst.mockReset();
    mocks.appointment.findFirst
      .mockResolvedValueOnce({ ...EXISTING, staffMemberId: "staff_1" }) // the save's own read
      .mockResolvedValueOnce(null); // the overlap check
    mocks.appointment.findMany.mockResolvedValue([]);
    currentRowIs({ ...EXISTING, businessId: "biz_1", staffMemberId: "staff_1" });

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      clientId: "client_2",
      staffMemberId: "staff_2",
      service: "Cleaning",
      startTime: "11:00",
      endTime: "11:45",
    });

    expect(result.ok).toBe(true);
    const call = mocks.appointment.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      id: "appt_1",
      businessId: "biz_1",
      status: "CONFIRMED",
      ...READ_SLOT,
      staffMemberId: "staff_1",
    });
    expect(call.data).toEqual(
      expect.objectContaining({
        clientId: "client_2",
        staffMemberId: "staff_2",
        title: "Cleaning",
        startAt: parseZonedWallClock("2026-06-01", "11:00"),
        endAt: parseZonedWallClock("2026-06-01", "11:45"),
      })
    );
  });
});

describe("saveAppointmentAction — cancelling from the Status dropdown offers the slot", () => {
  const CANCELLED_ROW = {
    ...EXISTING,
    client: { id: "client_1", name: "Mira" },
    staffMember: null,
    status: "CANCELLED",
  };

  beforeEach(() => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue(CANCELLED_ROW);
  });

  it("offers the freed slot to the waiting list inside the save's own transaction", async () => {
    const txClient = {
      appointment: mocks.appointment,
      appointmentReminder: mocks.appointmentReminder,
      scheduleBlock: mocks.scheduleBlock,
      $executeRaw: mocks.$executeRaw,
    };
    mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txClient));

    const result = await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "confirmed" });

    expect(result.ok).toBe(true);
    expect(mocks.offerFreedSlot).toHaveBeenCalledTimes(1);
    expect(mocks.offerFreedSlot).toHaveBeenCalledWith(txClient, {
      businessId: "biz_1",
      cancelled: {
        id: "appt_1",
        clientId: "client_1",
        staffMemberId: null,
        title: "Checkup",
        startAt: parseZonedWallClock("2026-06-01", "09:00"),
        endAt: parseZonedWallClock("2026-06-01", "09:30"),
      },
    });
  });

  it("offers nothing when the appointment was already cancelled, or the save isn't a cancel", async () => {
    // Same time/staff/title as PAYLOAD, so this is the "nothing about the slot
    // changed" case, not the "still cancelled but details changed" case below.
    mocks.appointment.findFirst.mockResolvedValueOnce({
      ...EXISTING,
      status: "CANCELLED",
      startAt: parseZonedWallClock("2026-06-01", "09:00"),
      endAt: parseZonedWallClock("2026-06-01", "09:30"),
    });
    await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "cancelled" });

    await saveAppointmentAction(PAYLOAD); // confirmed -> confirmed

    expect(mocks.offerFreedSlot).not.toHaveBeenCalled();
    expect(mocks.withdrawSlotOffers).not.toHaveBeenCalled();
  });

  it("offers nothing when the compare-and-set guard misses", async () => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });

    const result = await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "confirmed" });

    expect(result).toEqual({ ok: false, error: APPOINTMENT_CONFLICT_ERROR });
    expect(mocks.offerFreedSlot).not.toHaveBeenCalled();
  });
});

describe("saveAppointmentAction — un-cancelling withdraws the slot's offer", () => {
  // Same staff/time as the payload, so the reactivation's conflict re-check
  // finds nothing (no staff assigned -> only the schedule-block check runs).
  const CANCELLED_EXISTING = {
    ...EXISTING,
    status: "CANCELLED" as const,
    startAt: parseZonedWallClock("2026-06-01", "09:00"),
    endAt: parseZonedWallClock("2026-06-01", "09:30"),
  };

  beforeEach(() => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });
  });

  it("withdraws any open offer for the appointment inside the save's own transaction", async () => {
    const txClient = {
      appointment: mocks.appointment,
      appointmentReminder: mocks.appointmentReminder,
      scheduleBlock: mocks.scheduleBlock,
      $executeRaw: mocks.$executeRaw,
    };
    mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txClient));
    mocks.appointment.findFirst.mockResolvedValueOnce(CANCELLED_EXISTING);

    const result = await saveAppointmentAction({ ...PAYLOAD, status: "confirmed", baselineStatus: "cancelled" });

    expect(result.ok).toBe(true);
    expect(mocks.withdrawSlotOffers).toHaveBeenCalledWith(txClient, { businessId: "biz_1", appointmentId: "appt_1" });
    expect(mocks.offerFreedSlot).not.toHaveBeenCalled();
  });

  it("withdraws nothing for a save that neither leaves CANCELLED nor fails its guard", async () => {
    await saveAppointmentAction(PAYLOAD); // confirmed -> confirmed
    await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "confirmed" }); // a cancel

    mocks.appointment.findFirst.mockResolvedValueOnce(CANCELLED_EXISTING);
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 }); // reactivation lost its CAS
    await saveAppointmentAction({ ...PAYLOAD, status: "confirmed", baselineStatus: "cancelled" });

    expect(mocks.withdrawSlotOffers).not.toHaveBeenCalled();
  });

  it("editing a still-cancelled booking's time withdraws the old offer and re-offers the new details, in that order", async () => {
    const txClient = {
      appointment: mocks.appointment,
      appointmentReminder: mocks.appointmentReminder,
      scheduleBlock: mocks.scheduleBlock,
      $executeRaw: mocks.$executeRaw,
    };
    mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txClient));
    mocks.appointment.findFirst.mockResolvedValueOnce(CANCELLED_EXISTING);

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      status: "cancelled",
      baselineStatus: "cancelled",
      startTime: "14:00",
      endTime: "14:30",
    });

    expect(result.ok).toBe(true);
    expect(mocks.withdrawSlotOffers).toHaveBeenCalledWith(txClient, { businessId: "biz_1", appointmentId: "appt_1" });
    expect(mocks.offerFreedSlot).toHaveBeenCalledWith(txClient, {
      businessId: "biz_1",
      cancelled: {
        id: "appt_1",
        clientId: "client_1",
        staffMemberId: null,
        title: "Checkup",
        startAt: parseZonedWallClock("2026-06-01", "14:00"),
        endAt: parseZonedWallClock("2026-06-01", "14:30"),
      },
    });
    const withdrawOrder = mocks.withdrawSlotOffers.mock.invocationCallOrder[0];
    const offerOrder = mocks.offerFreedSlot.mock.invocationCallOrder[0];
    expect(withdrawOrder).toBeLessThan(offerOrder);
  });

  // Codex #130 (round 8): a duration-only edit (endAt moves, startAt
  // doesn't) still changes the window the offer promises — Book derives its
  // own duration from the saved end time, so a stale offer for the old,
  // shorter window could let Book mark the entry FILLED before the booking
  // form's own overlap check catches the now-longer slot conflicting with
  // whatever follows it.
  it("editing only a still-cancelled booking's duration withdraws the old offer and re-offers the new window", async () => {
    const txClient = {
      appointment: mocks.appointment,
      appointmentReminder: mocks.appointmentReminder,
      scheduleBlock: mocks.scheduleBlock,
      $executeRaw: mocks.$executeRaw,
    };
    mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txClient));
    mocks.appointment.findFirst.mockResolvedValueOnce(CANCELLED_EXISTING);

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      status: "cancelled",
      baselineStatus: "cancelled",
      endTime: "10:00", // was 09:30 — same start time, longer duration
    });

    expect(result.ok).toBe(true);
    expect(mocks.withdrawSlotOffers).toHaveBeenCalledWith(txClient, { businessId: "biz_1", appointmentId: "appt_1" });
    expect(mocks.offerFreedSlot).toHaveBeenCalledWith(txClient, {
      businessId: "biz_1",
      cancelled: {
        id: "appt_1",
        clientId: "client_1",
        staffMemberId: null,
        title: "Checkup",
        startAt: parseZonedWallClock("2026-06-01", "09:00"),
        endAt: parseZonedWallClock("2026-06-01", "10:00"),
      },
    });
  });

  it("saving a still-cancelled booking unchanged withdraws and offers nothing", async () => {
    mocks.appointment.findFirst.mockResolvedValueOnce(CANCELLED_EXISTING);

    await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "cancelled" });

    expect(mocks.withdrawSlotOffers).not.toHaveBeenCalled();
    expect(mocks.offerFreedSlot).not.toHaveBeenCalled();
  });

  // Codex #130: reassigning a still-cancelled booking to the very client who
  // currently holds its open offer left that offer live for the client who,
  // per the row's new data, is now the one who "cancelled" it.
  it("reassigning a still-cancelled booking's client (staff/time/title unchanged) withdraws and re-offers", async () => {
    const txClient = {
      appointment: mocks.appointment,
      appointmentReminder: mocks.appointmentReminder,
      scheduleBlock: mocks.scheduleBlock,
      $executeRaw: mocks.$executeRaw,
    };
    mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txClient));
    mocks.appointment.findFirst.mockResolvedValueOnce(CANCELLED_EXISTING);

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      clientId: "client_2",
      status: "cancelled",
      baselineStatus: "cancelled",
    });

    expect(result.ok).toBe(true);
    expect(mocks.withdrawSlotOffers).toHaveBeenCalledWith(txClient, { businessId: "biz_1", appointmentId: "appt_1" });
    expect(mocks.offerFreedSlot).toHaveBeenCalledWith(txClient, {
      businessId: "biz_1",
      cancelled: {
        id: "appt_1",
        clientId: "client_2",
        staffMemberId: null,
        title: "Checkup",
        startAt: parseZonedWallClock("2026-06-01", "09:00"),
        endAt: parseZonedWallClock("2026-06-01", "09:30"),
      },
    });
  });

  // Codex #130 (round 8): the availability check for the edited slot (lock +
  // overlap query) now lives INSIDE offerFreedSlot itself, shared by every
  // re-offer path — calendar/actions.ts no longer does its own check before
  // calling it, so this test only confirms the call happens with the right
  // (endAt-inclusive) window; offerFreedSlot's own conflict handling is
  // covered directly in slot-offers.test.ts.
  it("re-offers the edited still-cancelled slot's saved window", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
    const txClient = {
      appointment: mocks.appointment,
      appointmentReminder: mocks.appointmentReminder,
      scheduleBlock: mocks.scheduleBlock,
      $executeRaw: mocks.$executeRaw,
    };
    mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(txClient));
    mocks.appointment.findFirst.mockResolvedValueOnce({ ...CANCELLED_EXISTING, staffMemberId: "staff_1" });

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      staffMemberId: "staff_1",
      status: "cancelled",
      baselineStatus: "cancelled",
      startTime: "14:00",
      endTime: "14:30",
    });

    expect(result.ok).toBe(true);
    expect(mocks.withdrawSlotOffers).toHaveBeenCalledWith(txClient, { businessId: "biz_1", appointmentId: "appt_1" });
    expect(mocks.offerFreedSlot).toHaveBeenCalledWith(txClient, {
      businessId: "biz_1",
      cancelled: {
        id: "appt_1",
        clientId: "client_1",
        staffMemberId: "staff_1",
        title: "Checkup",
        startAt: parseZonedWallClock("2026-06-01", "14:00"),
        endAt: parseZonedWallClock("2026-06-01", "14:30"),
      },
    });
  });
});

describe("saveAppointmentAction — referenced client/staff deleted mid-save", () => {
  it("gives a specific message instead of the generic save failure on a foreign-key violation (P2003)", async () => {
    // The client/staff ownership checks run before the transaction opens, so
    // a concurrent delete of either one in that window survives them and
    // only surfaces here, as Prisma rejecting the create/update with a
    // foreign-key constraint error.
    mocks.appointment.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
        code: "P2003",
        clientVersion: "test",
      })
    );

    const result = await saveAppointmentAction(PAYLOAD);

    expect(result).toEqual({
      ok: false,
      error: "The selected client or staff member no longer exists. Refresh and try again.",
    });
  });

  it("still falls back to the generic message for any other error", async () => {
    mocks.appointment.updateMany.mockRejectedValue(new Error("connection reset"));

    const result = await saveAppointmentAction(PAYLOAD);

    expect(result).toEqual({
      ok: false,
      error: "We couldn't save the appointment.",
    });
  });
});

describe("saveAppointmentAction — business hours validation", () => {
  it("rejects a booking on a day with no configured business-hours row, instead of guessing Mon-Fri 9-5 is open", async () => {
    // PAYLOAD's date (2026-06-01) is a Monday and its 09:00-09:30 window sits
    // inside 9-5 — exactly the case the old fallback would have wrongly
    // treated as open when no BusinessHours row exists for that weekday.
    mocks.businessHours.findUnique.mockResolvedValue(null);

    const result = await saveAppointmentAction(PAYLOAD);

    expect(result).toEqual({
      ok: false,
      error: "This appointment is outside your operating hours. Choose a time inside the clinic schedule.",
    });
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
  });
});

describe("saveAppointmentAction — time conflicts", () => {
  const NEW_BOOKING: SaveAppointmentPayload = {
    clientId: "client_1",
    service: "Cleaning",
    staffMemberId: "staff_1",
    date: "2026-06-01",
    startTime: "10:00",
    endTime: "10:30",
    notes: "",
    status: "confirmed",
    baselineStatus: "confirmed",
  };

  it("rejects a new booking that overlaps another appointment for the same staff member", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
    mocks.appointment.findFirst.mockResolvedValue({ id: "other_appt" });

    const result = await saveAppointmentAction(NEW_BOOKING);

    expect(result).toEqual({ ok: false, error: APPOINTMENT_TIME_CONFLICT_ERROR });
    expect(mocks.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz_1",
          staffMemberId: "staff_1",
          status: { not: "CANCELLED" },
        }),
      })
    );
    expect(mocks.appointment.create).not.toHaveBeenCalled();
  });

  it("excludes the appointment's own row when editing its time, not just other appointments", async () => {
    // Reschedules to a different time for the same staff member — the
    // conflict check must run (schedulingFieldsChanged) and must not treat
    // this appointment's own pre-move row as a conflict with itself.
    mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
    mocks.appointment.findFirst.mockResolvedValueOnce({ ...EXISTING, staffMemberId: "staff_1" });
    mocks.appointment.findFirst.mockResolvedValueOnce(null);
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      staffMemberId: "staff_1",
      client: { id: "client_1", name: "Mira" },
      staffMember: { id: "staff_1", name: "Dr. Lee" },
    });

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      staffMemberId: "staff_1",
      startTime: "09:15",
      endTime: "09:45",
    });

    expect(result.ok).toBe(true);
    // Second call is the overlap check (the first is the pre-transaction
    // "existing row" read) — must exclude this appointment's own id, or
    // moving it would conflict with its own pre-move row.
    expect(mocks.appointment.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: "appt_1" } }),
      })
    );
  });

  it("skips the conflict check when the save's destination status is CANCELLED, even if time also changes", async () => {
    // Regression for a second gap Codex caught on the same PR: changing the
    // time WHILE also cancelling doesn't need a free slot at the new time —
    // a cancelled appointment never occupies one, so there's nothing to
    // protect. Rejecting this would block a legitimate cancel for no reason.
    mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
    mocks.appointment.findFirst.mockResolvedValueOnce({
      ...EXISTING,
      staffMemberId: "staff_1",
      status: "CONFIRMED",
    });
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      staffMemberId: "staff_1",
      client: { id: "client_1", name: "Mira" },
      staffMember: { id: "staff_1", name: "Dr. Lee" },
      status: "CANCELLED",
    });

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      staffMemberId: "staff_1",
      startTime: "09:15",
      endTime: "09:45",
      status: "cancelled",
      baselineStatus: "confirmed",
    });

    expect(result.ok).toBe(true);
    // Only the one pre-transaction existing-row read — no overlap check ran
    // despite staff/time both differing from the existing row.
    expect(mocks.appointment.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleBlock.findFirst).not.toHaveBeenCalled();
    expect(mocks.$executeRaw).not.toHaveBeenCalled();
  });

  it("skips the conflict check entirely when the save doesn't touch staff or time", async () => {
    // Only the status changes (e.g. cancelling via the Status dropdown) — the
    // slot itself isn't moving, so an unrelated pre-existing overlap on this
    // same slot must not block this save. The "existing" row's start/end
    // must be the real parsed values (not EXISTING's UTC-literal fixture,
    // which parseZonedWallClock's timezone offset makes NOT actually equal
    // to a payload of "09:00"/"09:30" — that mismatch would itself register
    // as a scheduling change and defeat the point of this test).
    mocks.appointment.findFirst.mockResolvedValueOnce({
      ...EXISTING,
      startAt: parseZonedWallClock("2026-06-01", "09:00"),
      endAt: parseZonedWallClock("2026-06-01", "09:30"),
    });
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
      status: "CANCELLED",
    });

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      status: "cancelled",
      baselineStatus: "confirmed",
    });

    expect(result.ok).toBe(true);
    // Only the one pre-transaction existing-row read — no overlap check ran.
    expect(mocks.appointment.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleBlock.findFirst).not.toHaveBeenCalled();
    expect(mocks.$executeRaw).not.toHaveBeenCalled();
  });

  it("re-checks when reactivating a cancelled appointment, even though staff/time never changed", async () => {
    // Regression for a gap Codex caught on PR #75: a CANCELLED appointment
    // doesn't occupy its slot, so another appointment may have taken it —
    // un-cancelling back onto the same unchanged staff/time must not skip
    // the check just because staff/start/end look unchanged.
    mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
    mocks.appointment.findFirst
      .mockResolvedValueOnce({
        ...EXISTING,
        staffMemberId: "staff_1",
        status: "CANCELLED",
        startAt: parseZonedWallClock("2026-06-01", "09:00"),
        endAt: parseZonedWallClock("2026-06-01", "09:30"),
      })
      .mockResolvedValueOnce({ id: "other_appt" });

    const result = await saveAppointmentAction({
      ...PAYLOAD,
      staffMemberId: "staff_1",
      status: "confirmed",
      baselineStatus: "cancelled",
    });

    expect(result).toEqual({ ok: false, error: APPOINTMENT_TIME_CONFLICT_ERROR });
    expect(mocks.$executeRaw).toHaveBeenCalled();
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a booking that falls inside a blocked-off period, even with no staff assigned", async () => {
    mocks.scheduleBlock.findFirst.mockResolvedValue({ id: "block_1" });

    const result = await saveAppointmentAction({
      ...NEW_BOOKING,
      staffMemberId: undefined,
    });

    expect(result).toEqual({ ok: false, error: APPOINTMENT_TIME_CONFLICT_ERROR });
    expect(mocks.appointment.create).not.toHaveBeenCalled();
    // No staff assigned, so the staff-overlap check has nothing to check —
    // only the business-wide block query should have run.
    expect(mocks.appointment.findFirst).not.toHaveBeenCalled();
  });

  it("saves normally when neither check finds a conflict", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
    mocks.appointment.findFirst.mockResolvedValue(null);
    mocks.appointment.create.mockResolvedValue({ id: "new_appt" });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      id: "new_appt",
      clientId: "client_1",
      staffMemberId: "staff_1",
      startAt: new Date("2026-06-01T10:00:00Z"),
      endAt: new Date("2026-06-01T10:30:00Z"),
      notes: null,
      status: "CONFIRMED",
      client: { id: "client_1", name: "Mira" },
      staffMember: { id: "staff_1", name: "Dr. Lee" },
    });

    const result = await saveAppointmentAction(NEW_BOOKING);

    expect(result.ok).toBe(true);
    expect(mocks.appointment.create).toHaveBeenCalled();
  });

  // Codex #130: hasSchedulingConflict deliberately excludes CANCELLED rows
  // (booking over a freed slot is allowed), but a CANCELLED appointment at
  // that same staff+time can still be holding a live waiting-list offer —
  // this new booking just filled the slot a different way, so that offer
  // must be withdrawn the same way un-cancelling the SAME appointment
  // already does, or staff/patients could still act on an offer for a slot
  // that's no longer actually free.
  it("withdraws a live slot offer on a different, still-cancelled appointment when a new booking takes its staff+time", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
    mocks.appointment.findFirst.mockResolvedValue(null); // no active conflict
    mocks.appointment.findMany.mockResolvedValue([{ id: "cancelled_appt_1" }]);
    mocks.appointment.create.mockResolvedValue({ id: "new_appt" });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      id: "new_appt",
      clientId: "client_1",
      staffMemberId: "staff_1",
      startAt: new Date("2026-06-01T10:00:00Z"),
      endAt: new Date("2026-06-01T10:30:00Z"),
      notes: null,
      status: "CONFIRMED",
      client: { id: "client_1", name: "Mira" },
      staffMember: { id: "staff_1", name: "Dr. Lee" },
    });

    const result = await saveAppointmentAction(NEW_BOOKING);

    expect(result.ok).toBe(true);
    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz_1",
          staffMemberId: "staff_1",
          status: "CANCELLED",
          startAt: { lt: parseZonedWallClock("2026-06-01", "10:30") },
          endAt: { gt: parseZonedWallClock("2026-06-01", "10:00") },
        }),
      })
    );
    expect(mocks.withdrawSlotOffers).toHaveBeenCalledWith(
      expect.anything(),
      { businessId: "biz_1", appointmentId: "cancelled_appt_1" }
    );
  });

  it("does not look for an overlapping cancelled appointment when the save itself cancels", async () => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue({
      ...EXISTING,
      client: { id: "client_1", name: "Mira" },
      staffMember: null,
    });

    await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "confirmed" });

    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });
});

describe("loadCalendarMonthAction", () => {
  const MONTH = {
    range: { from: "2026-08-31", to: "2026-10-04" },
    appointments: [],
    scheduleBlocks: [],
  };

  beforeEach(() => {
    mocks.toBusinessIdentity.mockReturnValue({ businessName: "Clinic", ownerName: "Owner Name" });
    mocks.loadCalendarMonth.mockResolvedValue(MONTH);
  });

  // Codex #140: over the action budget, waiting fixes it; signing in again doesn't.
  it("doesn't call an over-budget request an expired session", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ error: "Too many requests right now.", throttled: true });

    const result = await loadCalendarMonthAction("2026-09");

    expect(result).toEqual({ ok: false, error: "Too many requests right now.", sessionExpired: false });
    expect(mocks.loadCalendarMonth).not.toHaveBeenCalled();
  });

  it("refuses an expired session without touching the database", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ error: "Your session expired." });

    const result = await loadCalendarMonthAction("2026-09");

    // Flagged so the calendar offers a sign-in link, not a "Try again" that can never work.
    expect(result).toEqual({ ok: false, error: "Your session expired.", sessionExpired: true });
    expect(mocks.loadCalendarMonth).not.toHaveBeenCalled();
  });

  it.each(["", "2026-9", "2026-13", "1999-01", "9999-99", "2026-09-01"])(
    "rejects the invalid month %j before querying",
    async (monthKey) => {
      const result = await loadCalendarMonthAction(monthKey);

      expect(result).toEqual({ ok: false, error: "Choose a valid month." });
      // Not an auth failure, so it must not be reported as one.
      expect(result).not.toHaveProperty("sessionExpired");
      expect(mocks.loadCalendarMonth).not.toHaveBeenCalled();
    }
  );

  it("loads the month for the signed-in clinic only, using the owner name for unassigned visits", async () => {
    const result = await loadCalendarMonthAction("2026-09");

    expect(mocks.loadCalendarMonth).toHaveBeenCalledWith({
      businessId: "biz_1",
      monthKey: "2026-09",
      ownerName: "Owner Name",
    });
    expect(result).toEqual({ ok: true, ...MONTH });
  });
});

const NO_SHOW_ROW = {
  id: "appt_1",
  clientId: "client_1",
  client: { id: "client_1", name: "Test Patient" },
  staffMemberId: null,
  staffMember: null,
  title: "Checkup",
  startAt: new Date("2026-06-01T09:00:00Z"),
  endAt: new Date("2026-06-01T09:30:00Z"),
  notes: null,
  status: "NO_SHOW" as const,
};

describe("saveAppointmentAction — no-show status", () => {
  const NO_SHOW_PAYLOAD: SaveAppointmentPayload = { ...PAYLOAD, status: "no-show" };

  beforeEach(() => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue(NO_SHOW_ROW);
  });

  it("saves a no-show for a started appointment on Pro and reads it back as no-show", async () => {
    const result = await saveAppointmentAction(NO_SHOW_PAYLOAD);

    expect(result.ok).toBe(true);
    expect(result.appointment?.status).toBe("no-show");
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "NO_SHOW" }) })
    );
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalled();
  });

  it("refuses to set a no-show on a workspace that isn't on Pro", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "BASIC" }, user: {} });

    expect(await saveAppointmentAction(NO_SHOW_PAYLOAD)).toEqual({ ok: false, error: NO_SHOW_PLAN_ERROR });
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("still lets a Basic workspace save an existing no-show without changing its status", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "BASIC" }, user: {} });
    mocks.appointment.findFirst.mockResolvedValue({ ...EXISTING, status: "NO_SHOW" });

    const result = await saveAppointmentAction({ ...NO_SHOW_PAYLOAD, baselineStatus: "no-show" });

    expect(result.ok).toBe(true);
  });

  it("refuses a no-show for an appointment that has not started", async () => {
    expect(await saveAppointmentAction({ ...NO_SHOW_PAYLOAD, date: "2099-01-01" })).toEqual({
      ok: false,
      error: APPOINTMENT_NOT_STARTED_ERROR,
    });
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("does not let a forged baselineStatus exempt a NEW booking on a Basic workspace", async () => {
    // baselineStatus comes from the request body. On an edit the compare-and-set
    // against the live row makes a forged value harmless, but a new booking has
    // no row to anchor it — only an existing row may keep a no-show on Basic.
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "BASIC" }, user: {} });

    expect(
      await saveAppointmentAction({ ...NO_SHOW_PAYLOAD, id: undefined, baselineStatus: "no-show" })
    ).toEqual({ ok: false, error: NO_SHOW_PLAN_ERROR });
    expect(mocks.appointment.create).not.toHaveBeenCalled();
  });

  it("creates a new past no-show on Pro", async () => {
    mocks.appointment.create.mockResolvedValue({ id: "appt_1" });

    const result = await saveAppointmentAction({
      ...NO_SHOW_PAYLOAD,
      id: undefined,
      baselineStatus: "confirmed",
    });

    expect(result.ok).toBe(true);
    expect(mocks.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "NO_SHOW" }) })
    );
  });

  it("refuses to cancel a recorded no-show through the edit form's Status dropdown", async () => {
    // Otherwise a finalized no-show could be overwritten and drop out of the
    // no-show count and rate; the way back is "Mark as attended".
    mocks.appointment.findFirst.mockResolvedValue({ ...EXISTING, status: "NO_SHOW" });

    expect(
      await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "no-show" })
    ).toEqual({ ok: false, error: APPOINTMENT_ALREADY_NO_SHOW_ERROR });
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
    expect(mocks.revalidateCalendarSurfaces).not.toHaveBeenCalled();
  });

  it("refuses to relabel a cancelled booking as a no-show through the edit form", async () => {
    // Same rule recordAppointmentAttendanceCore enforces for the quick action.
    mocks.appointment.findFirst.mockResolvedValue({ ...EXISTING, status: "CANCELLED" });

    expect(await saveAppointmentAction({ ...NO_SHOW_PAYLOAD, baselineStatus: "cancelled" })).toEqual({
      ok: false,
      error: APPOINTMENT_CANCELLED_NO_SHOW_ERROR,
    });
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
  });
});

describe("recordAppointmentAttendanceAction", () => {
  // Client-serialized args aren't type-checked at runtime, so a crafted
  // `{ not: "" }` would otherwise reach recordAppointmentAttendanceCore's
  // updateMany as part of its `where` clause — flipping every eligible
  // appointment in the workspace to NO_SHOW/COMPLETED instead of one (Codex).
  it("rejects a non-string appointment id before checking the plan or touching the database", async () => {
    const result = await recordAppointmentAttendanceAction({ not: "" } as unknown as string, false);

    expect(result).toEqual({ ok: false, error: "Appointment not found in this clinic workspace." });
    expect(mocks.getAuthedBusiness).not.toHaveBeenCalled();
    expect(mocks.recordAttendance).not.toHaveBeenCalled();
  });

  it("refuses a workspace that isn't on Pro without touching the appointment", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "BASIC" }, user: {} });

    expect(await recordAppointmentAttendanceAction("appt_1", false)).toEqual({
      ok: false,
      error: NO_SHOW_PLAN_ERROR,
    });
    expect(mocks.recordAttendance).not.toHaveBeenCalled();
  });

  it("marks a no-show, refreshes every surface, and reports the new status", async () => {
    mocks.recordAttendance.mockResolvedValue({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: "staff_1",
      changed: true,
    });

    expect(await recordAppointmentAttendanceAction("appt_1", false)).toEqual({
      ok: true,
      status: "no-show",
      clientId: "client_1",
    });
    expect(mocks.recordAttendance).toHaveBeenCalledWith({
      id: "appt_1",
      businessId: "biz_1",
      attended: false,
    });
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(["client_1"], ["staff_1"], ["appt_1"]);
  });

  it("undoes a no-show back to completed", async () => {
    mocks.recordAttendance.mockResolvedValue({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: null,
      changed: true,
    });

    expect(await recordAppointmentAttendanceAction("appt_1", true)).toEqual({
      ok: true,
      status: "completed",
      clientId: "client_1",
    });
  });

  it("skips revalidation when nothing changed, but still reports the live clientId (Codex)", async () => {
    mocks.recordAttendance.mockResolvedValue({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: null,
      changed: false,
    });

    expect(await recordAppointmentAttendanceAction("appt_1", false)).toEqual({
      ok: true,
      status: "no-show",
      clientId: "client_1",
    });
    expect(mocks.revalidateCalendarSurfaces).not.toHaveBeenCalled();
  });

  it("reports the server-confirmed clientId even when it differs from what the caller's cache might expect (Codex #129 round 2)", async () => {
    // Another tab reassigned this appointment to a different client before
    // this mutation ran — recordAttendanceCore reads the row fresh, so it
    // returns the live owner, not whatever the caller had cached.
    mocks.recordAttendance.mockResolvedValue({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_reassigned",
      staffMemberId: "staff_1",
      changed: true,
    });

    const result = await recordAppointmentAttendanceAction("appt_1", false);

    expect(result).toEqual({ ok: true, status: "no-show", clientId: "client_reassigned" });
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(
      ["client_reassigned"],
      ["staff_1"],
      ["appt_1"]
    );
  });

  it("passes the core's reason through, and words a missing appointment for this workspace", async () => {
    mocks.recordAttendance.mockResolvedValueOnce({ ok: false, status: 409, error: APPOINTMENT_NOT_STARTED_ERROR });
    expect(await recordAppointmentAttendanceAction("appt_1", false)).toEqual({
      ok: false,
      error: APPOINTMENT_NOT_STARTED_ERROR,
    });

    mocks.recordAttendance.mockResolvedValueOnce({ ok: false, status: 404, error: "Appointment not found." });
    expect(await recordAppointmentAttendanceAction("appt_1", false)).toEqual({
      ok: false,
      error: "Appointment not found in this clinic workspace.",
    });
  });
});

describe("cancelAppointmentAction", () => {
  // Same class of bug as recordAppointmentAttendanceAction above: a crafted
  // `{ not: "" }` would otherwise reach cancelAppointmentCore's updateMany
  // as part of its `where` clause, cancelling every non-terminal appointment
  // in the workspace instead of one (Codex).
  it("rejects a non-string appointment id before checking auth or touching the database", async () => {
    const result = await cancelAppointmentAction({ not: "" } as unknown as string);

    expect(result).toEqual({ ok: false, error: "Appointment not found in this clinic workspace." });
    expect(mocks.getAuthedBusiness).not.toHaveBeenCalled();
    expect(mocks.cancelAppointmentCore).not.toHaveBeenCalled();
  });

  it("cancels a real appointment and revalidates", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1" }, user: {} });
    mocks.cancelAppointmentCore.mockResolvedValue({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: "staff_1",
      changed: true,
    });

    const result = await cancelAppointmentAction("appt_1");

    expect(result).toEqual({ ok: true, appointmentId: "appt_1" });
    expect(mocks.cancelAppointmentCore).toHaveBeenCalledWith({ id: "appt_1", businessId: "biz_1" });
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(["client_1"], ["staff_1"], ["appt_1"]);
  });
});

describe("deleteAppointmentAction", () => {
  // Same class of bug: a crafted `{ not: "" }` would otherwise reach
  // deleteAppointmentCore's deleteMany as part of its `where` clause,
  // deleting every appointment in the workspace instead of one (Codex).
  it("rejects a non-string appointment id before checking auth or touching the database", async () => {
    const result = await deleteAppointmentAction({ not: "" } as unknown as string);

    expect(result).toEqual({ ok: false, error: "Appointment not found in this clinic workspace." });
    expect(mocks.getAuthedBusiness).not.toHaveBeenCalled();
    expect(mocks.deleteAppointmentCore).not.toHaveBeenCalled();
  });

  it("deletes a real appointment and revalidates", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1" }, user: {} });
    mocks.deleteAppointmentCore.mockResolvedValue({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: "staff_1",
      changed: true,
    });

    const result = await deleteAppointmentAction("appt_1");

    expect(result).toEqual({ ok: true, appointmentId: "appt_1" });
    expect(mocks.deleteAppointmentCore).toHaveBeenCalledWith({ id: "appt_1", businessId: "biz_1" });
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(["client_1"], ["staff_1"], ["appt_1"]);
  });
});

describe("getNoShowRiskAction", () => {
  // Codex #140: rejecting lets the calendar forget the ids and ask again later.
  it("rejects an over-budget request instead of answering 'no risk'", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ error: "Too many requests right now.", throttled: true });

    await expect(getNoShowRiskAction(["a1"])).rejects.toThrow("Too many requests right now.");
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });

  it("still answers nothing for a signed-out request", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ error: "Your session expired." });

    expect(await getNoShowRiskAction(["a1"])).toEqual({});
  });

  it("returns nothing for a workspace that isn't on Pro, without querying", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "BASIC" }, user: {} });

    expect(await getNoShowRiskAction(["a1"])).toEqual({});
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });

  it("looks up only PENDING/CONFIRMED rows in this business and returns the assessments as a plain object", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "PRO" }, user: {} });
    mocks.appointment.findMany.mockResolvedValue([
      { id: "a1", clientId: "c1", startAt: new Date("2026-07-10T09:00:00Z"), createdAt: new Date("2026-07-01T09:00:00Z"), status: "CONFIRMED" },
    ]);
    mocks.getRiskAssessments.mockResolvedValue(new Map([["a1", { level: "high", reasons: ["Missed a recent appointment"], insufficientHistory: false }]]));

    const result = await getNoShowRiskAction(["a1"]);

    expect(result).toEqual({ a1: { level: "high", reasons: ["Missed a recent appointment"], insufficientHistory: false } });
    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["a1"] }, businessId: "biz_1", status: { in: ["PENDING", "CONFIRMED"] } }),
      })
    );
  });

  it("caps an oversized id batch to MAX_RISK_BATCH_SIZE (200) instead of querying an unbounded IN clause", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "PRO" }, user: {} });
    mocks.appointment.findMany.mockResolvedValue([]);
    mocks.getRiskAssessments.mockResolvedValue(new Map());

    const ids = Array.from({ length: 250 }, (_, i) => `a${i}`);
    await getNoShowRiskAction(ids);

    const call = mocks.appointment.findMany.mock.calls[0][0];
    const queriedIds: string[] = call.where.id.in;
    expect(queriedIds).toHaveLength(200);
    expect(queriedIds).toEqual(ids.slice(0, 200));
    expect(queriedIds).not.toContain("a200");
  });

  // Client-serialized args aren't type-checked at runtime, so a crafted
  // `{ not: "" }` would otherwise become part of the Prisma `in:` filter
  // instead of matching only real ids (Codex).
  it("drops a crafted non-string id before it reaches the database", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "PRO" }, user: {} });
    mocks.appointment.findMany.mockResolvedValue([
      { id: "a1", clientId: "c1", startAt: new Date("2026-07-10T09:00:00Z"), createdAt: new Date("2026-07-01T09:00:00Z"), status: "CONFIRMED" },
    ]);
    mocks.getRiskAssessments.mockResolvedValue(new Map([["a1", { level: "high", reasons: [], insufficientHistory: false }]]));

    const result = await getNoShowRiskAction(["a1", { not: "" } as unknown as string]);

    expect(Object.keys(result)).toEqual(["a1"]);
    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["a1"] } }) })
    );
  });

  it("returns nothing without querying when every id is invalid", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "PRO" }, user: {} });

    expect(await getNoShowRiskAction([{ not: "" } as unknown as string, "" as unknown as string])).toEqual({});
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });
});

// Server actions take client-serialized arguments: an object id like
// `{ not: "" }` would reach Prisma's `where` as a filter over the whole
// workspace (a delete or cancel of every appointment, an edit of every row).
describe("appointment actions refuse a non-string id before touching the database", () => {
  const CRAFTED_ID = { not: "" } as unknown as string;
  const NOT_FOUND = { ok: false, error: "Appointment not found in this clinic workspace." };

  function expectNoDatabaseCall() {
    const models = [
      mocks.appointment,
      mocks.client,
      mocks.staffMember,
      mocks.businessHours,
      mocks.appointmentReminder,
      mocks.scheduleBlock,
    ];
    for (const fn of models.flatMap((model) => Object.values(model))) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(mocks.revalidateCalendarSurfaces).not.toHaveBeenCalled();
    expect(mocks.notifyStaffOfAppointmentChange).not.toHaveBeenCalled();
  }

  it("delete", async () => {
    expect(await deleteAppointmentAction(CRAFTED_ID)).toEqual(NOT_FOUND);
    expect(deleteAppointmentCore).not.toHaveBeenCalled();
    expectNoDatabaseCall();
  });

  it("cancel", async () => {
    expect(await cancelAppointmentAction(CRAFTED_ID)).toEqual(NOT_FOUND);
    expect(cancelAppointmentCore).not.toHaveBeenCalled();
    expectNoDatabaseCall();
  });

  it("record attendance", async () => {
    expect(await recordAppointmentAttendanceAction(CRAFTED_ID, false)).toEqual(NOT_FOUND);
    expect(mocks.recordAttendance).not.toHaveBeenCalled();
    expectNoDatabaseCall();
  });

  it("save, when the edited appointment's id is crafted", async () => {
    expect(await saveAppointmentAction({ ...PAYLOAD, id: CRAFTED_ID })).toEqual(NOT_FOUND);
    expectNoDatabaseCall();
  });

  it("save, when the staff id is crafted", async () => {
    expect(await saveAppointmentAction({ ...PAYLOAD, staffMemberId: CRAFTED_ID })).toEqual({
      ok: false,
      error: "The selected staff member does not belong to this clinic workspace.",
    });
    expectNoDatabaseCall();
  });

  it("save, when the client id is crafted (treated as no client chosen)", async () => {
    expect(await saveAppointmentAction({ ...PAYLOAD, clientId: CRAFTED_ID })).toEqual({
      ok: false,
      error: "Choose a client and valid start/end time before saving.",
    });
    expectNoDatabaseCall();
  });

  it("risk lookup drops non-string ids and skips the query when none are left", async () => {
    mocks.appointment.findMany.mockResolvedValue([]);
    mocks.getRiskAssessments.mockResolvedValue(new Map());

    expect(await getNoShowRiskAction([CRAFTED_ID])).toEqual({});
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();

    await getNoShowRiskAction([CRAFTED_ID, "a1"]);
    expect(mocks.appointment.findMany.mock.calls[0][0].where.id).toEqual({ in: ["a1"] });
  });
});
