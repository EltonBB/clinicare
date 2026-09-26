import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    // Real implementations, not mocks — both take the (mocked) tx client as
    // a plain argument rather than reaching for the top-level prisma import,
    // so running the real query-construction logic here is what makes this
    // suite's assertions on the exact `where` shape mean anything.
    acquireSchedulingLock: actual.acquireSchedulingLock,
    hasSchedulingConflict: actual.hasSchedulingConflict,
    APPOINTMENT_CANCELLED_NO_SHOW_ERROR: actual.APPOINTMENT_CANCELLED_NO_SHOW_ERROR,
    APPOINTMENT_NOT_STARTED_ERROR: actual.APPOINTMENT_NOT_STARTED_ERROR,
    NO_SHOW_PLAN_ERROR: actual.NO_SHOW_PLAN_ERROR,
    cancelAppointmentCore: vi.fn(),
    deleteAppointmentCore: vi.fn(),
    recordAppointmentAttendanceCore: mocks.recordAttendance,
    refreshClientLastVisitAt: mocks.refreshClientLastVisitAt,
    notifyStaffOfAppointmentChange: mocks.notifyStaffOfAppointmentChange,
    revalidateCalendarSurfaces: mocks.revalidateCalendarSurfaces,
  };
});

import {
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
        where: { id: "appt_1", businessId: "biz_1", status: "CONFIRMED" },
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
        where: { id: "appt_1", businessId: "biz_1", status: "CONFIRMED" },
      })
    );
    // The edit page renders the status this save changes, so it is refreshed too.
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(
      ["client_1", "client_1"],
      [null, null],
      ["appt_1"]
    );
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
        where: { id: "appt_1", businessId: "biz_1", status: "CONFIRMED" },
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
        where: { id: "appt_1", businessId: "biz_1", status: "CONFIRMED" },
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
      },
    });
  });

  it("offers nothing when the appointment was already cancelled, or the save isn't a cancel", async () => {
    mocks.appointment.findFirst.mockResolvedValueOnce({ ...EXISTING, status: "CANCELLED" });
    await saveAppointmentAction({ ...PAYLOAD, status: "cancelled", baselineStatus: "cancelled" });

    await saveAppointmentAction(PAYLOAD); // confirmed -> confirmed

    expect(mocks.offerFreedSlot).not.toHaveBeenCalled();
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

    expect(await recordAppointmentAttendanceAction("appt_1", false)).toEqual({ ok: true, status: "no-show" });
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

    expect(await recordAppointmentAttendanceAction("appt_1", true)).toEqual({ ok: true, status: "completed" });
  });

  it("skips revalidation when nothing changed", async () => {
    mocks.recordAttendance.mockResolvedValue({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: null,
      changed: false,
    });

    await recordAppointmentAttendanceAction("appt_1", false);

    expect(mocks.revalidateCalendarSurfaces).not.toHaveBeenCalled();
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

describe("getNoShowRiskAction", () => {
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
});
