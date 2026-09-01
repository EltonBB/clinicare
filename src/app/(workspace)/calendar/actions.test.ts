import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      appointment: mocks.appointment,
      appointmentReminder: mocks.appointmentReminder,
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
