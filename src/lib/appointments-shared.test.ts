import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const appointment = {
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
  };
  const appointmentReminder = { deleteMany: vi.fn() };
  const client = { updateMany: vi.fn() };
  const $transaction = vi.fn();
  return { appointment, appointmentReminder, client, $transaction };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: mocks.appointment,
    appointmentReminder: mocks.appointmentReminder,
    client: mocks.client,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/mobile/push", () => ({
  buildStaffPushPayload: vi.fn(),
  sendStaffPush: vi.fn(),
}));

import { APPOINTMENT_ALREADY_COMPLETED_ERROR, cancelAppointmentCore } from "./appointments-shared";

const WHERE = { id: "appt_1", businessId: "biz_1" };
const RECORD = { id: "appt_1", clientId: "client_1", staffMemberId: "staff_1" };

/** The guarded update matched a row and cancelled it — the success path. */
function mockGuardHit() {
  mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
  mocks.appointment.findFirstOrThrow.mockResolvedValue(RECORD);
  mocks.appointment.findFirst.mockResolvedValue(null); // refreshClientLastVisitAt's latest-visit lookup
  mocks.client.updateMany.mockResolvedValue({ count: 1 });
}

/** The guarded update matched nothing — diagnostic lookup returns `status`. */
function mockGuardMiss(status: "COMPLETED" | "CANCELLED" | null) {
  mocks.appointment.updateMany.mockResolvedValue({ count: 0 });
  mocks.appointment.findFirst.mockResolvedValue(status ? { ...RECORD, status } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) =>
      cb({
        appointment: mocks.appointment,
        appointmentReminder: mocks.appointmentReminder,
        client: mocks.client,
      })
  );
});

describe("cancelAppointmentCore", () => {
  it("cancels a CONFIRMED appointment, clears reminders, and refreshes lastVisitAt", async () => {
    mockGuardHit();

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toEqual({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: "staff_1",
      changed: true,
    });
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith({
      where: { ...WHERE, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      data: { status: "CANCELLED" },
    });
    expect(mocks.appointmentReminder.deleteMany).toHaveBeenCalledWith({
      where: { appointmentId: "appt_1" },
    });
    expect(mocks.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "client_1", businessId: "biz_1" } })
    );
  });

  it("refuses to cancel a COMPLETED visit with 409, without writing anything", async () => {
    mockGuardMiss("COMPLETED");

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: APPOINTMENT_ALREADY_COMPLETED_ERROR,
    });
    expect(mocks.appointmentReminder.deleteMany).not.toHaveBeenCalled();
    expect(mocks.client.updateMany).not.toHaveBeenCalled();
  });

  it("closes the race: a concurrent sweep completing the visit between the guard check and this call is still refused, not silently overwritten", async () => {
    // The caller (e.g. the mobile app) may have loaded this appointment as
    // CONFIRMED moments earlier. completePastConfirmedAppointments' 5-minute
    // sweep flips it to COMPLETED before this cancel's updateMany runs.
    // Because the guard lives in the updateMany's WHERE clause — evaluated
    // by Postgres against the row's current committed state, not a stale
    // read — the guarded update affects zero rows here, exactly as it would
    // for a request that read COMPLETED from the start.
    mockGuardMiss("COMPLETED");

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toMatchObject({ ok: false, status: 409 });
    // The critical assertion: no unconditional write ever ran. Only the
    // guarded updateMany (which affected 0 rows) and a read-only diagnostic
    // lookup happened — nothing in this call could have overwritten the
    // sweep's COMPLETED status.
    expect(mocks.appointment.findFirstOrThrow).not.toHaveBeenCalled();
    expect(mocks.appointmentReminder.deleteMany).not.toHaveBeenCalled();
  });

  it("is idempotent for an already-CANCELLED appointment — including a re-cancel racing the guard itself", async () => {
    // A real UPDATE ... WHERE status NOT IN (...) run against an
    // already-CANCELLED row still MATCHES (Postgres counts a matched no-op
    // write as affected) unless CANCELLED is itself excluded from the
    // guard — this is the regression this test exists to catch: it asserts
    // on the actual WHERE clause passed to updateMany, not just on a
    // hand-picked mock count, so a guard that silently drops "CANCELLED"
    // from the exclusion list fails this test instead of passing it.
    mockGuardMiss("CANCELLED");

    const result = await cancelAppointmentCore(WHERE);

    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: ["COMPLETED", "CANCELLED"] } }),
      })
    );
    expect(result).toEqual({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: "staff_1",
      changed: false,
    });
    expect(mocks.appointmentReminder.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the appointment doesn't exist (or isn't in scope)", async () => {
    mockGuardMiss(null);

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toEqual({ ok: false, status: 404, error: "Appointment not found." });
  });

  it("scopes the guarded update by staffMemberId when the mobile caller provides it", async () => {
    mockGuardHit();

    await cancelAppointmentCore({ ...WHERE, staffMemberId: "staff_1" });

    expect(mocks.appointment.updateMany).toHaveBeenCalledWith({
      where: { ...WHERE, staffMemberId: "staff_1", status: { notIn: ["COMPLETED", "CANCELLED"] } },
      data: { status: "CANCELLED" },
    });
  });
});
