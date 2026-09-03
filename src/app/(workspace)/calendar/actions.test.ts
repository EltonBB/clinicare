import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseZonedWallClock } from "@/lib/time-zone";

const mocks = vi.hoisted(() => {
  const appointment = {
    findFirst: vi.fn(),
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
  const refreshClientLastVisitAt = vi.fn();
  const notifyStaffOfAppointmentChange = vi.fn();
  const revalidateCalendarSurfaces = vi.fn();
  return {
    appointment,
    client,
    staffMember,
    businessHours,
    appointmentReminder,
    scheduleBlock,
    $executeRaw,
    $transaction,
    getAuthedBusiness,
    refreshClientLastVisitAt,
    notifyStaffOfAppointmentChange,
    revalidateCalendarSurfaces,
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
}));

vi.mock("@/lib/appointments-shared", async () => {
  // Real constant, mocked functions — so this suite always checks the
  // actual shared error string instead of a second hand-typed copy of it.
  const actual =
    await vi.importActual<typeof import("@/lib/appointments-shared")>("@/lib/appointments-shared");
  return {
    APPOINTMENT_ALREADY_COMPLETED_ERROR: actual.APPOINTMENT_ALREADY_COMPLETED_ERROR,
    APPOINTMENT_CONFLICT_ERROR: actual.APPOINTMENT_CONFLICT_ERROR,
    APPOINTMENT_TIME_CONFLICT_ERROR: actual.APPOINTMENT_TIME_CONFLICT_ERROR,
    // Real implementations, not mocks — both take the (mocked) tx client as
    // a plain argument rather than reaching for the top-level prisma import,
    // so running the real query-construction logic here is what makes this
    // suite's assertions on the exact `where` shape mean anything.
    acquireSchedulingLock: actual.acquireSchedulingLock,
    hasSchedulingConflict: actual.hasSchedulingConflict,
    cancelAppointmentCore: vi.fn(),
    deleteAppointmentCore: vi.fn(),
    refreshClientLastVisitAt: mocks.refreshClientLastVisitAt,
    notifyStaffOfAppointmentChange: mocks.notifyStaffOfAppointmentChange,
    revalidateCalendarSurfaces: mocks.revalidateCalendarSurfaces,
  };
});

import { saveAppointmentAction, type SaveAppointmentPayload } from "./actions";
import {
  APPOINTMENT_ALREADY_COMPLETED_ERROR,
  APPOINTMENT_CONFLICT_ERROR,
  APPOINTMENT_TIME_CONFLICT_ERROR,
} from "@/lib/appointments-shared";

const BUSINESS = { id: "biz_1" };
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
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalled();
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
