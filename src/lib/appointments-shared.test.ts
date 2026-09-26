import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const appointment = {
    updateMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
  };
  const appointmentReminder = { deleteMany: vi.fn() };
  const client = { updateMany: vi.fn() };
  const business = { findUniqueOrThrow: vi.fn() };
  const waitlistEntry = { updateMany: vi.fn() };
  const followUpDraft = { create: vi.fn() };
  const $transaction = vi.fn();
  const revalidatePath = vi.fn();
  const isProBusinessPlan = vi.fn();
  const findMatchingWaitlistCandidates = vi.fn();
  return {
    appointment,
    appointmentReminder,
    client,
    business,
    waitlistEntry,
    followUpDraft,
    $transaction,
    revalidatePath,
    isProBusinessPlan,
    findMatchingWaitlistCandidates,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: mocks.appointment,
    appointmentReminder: mocks.appointmentReminder,
    client: mocks.client,
    business: mocks.business,
    waitlistEntry: mocks.waitlistEntry,
    followUpDraft: mocks.followUpDraft,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/mobile/push", () => ({
  buildStaffPushPayload: vi.fn(),
  sendStaffPush: vi.fn(),
}));
vi.mock("@/lib/billing", () => ({ isProBusinessPlan: mocks.isProBusinessPlan }));
vi.mock("@/lib/waitlist-data", () => ({
  findMatchingWaitlistCandidates: mocks.findMatchingWaitlistCandidates,
}));

import {
  APPOINTMENT_ALREADY_COMPLETED_ERROR,
  APPOINTMENT_ALREADY_NO_SHOW_ERROR,
  APPOINTMENT_CANCELLED_NO_SHOW_ERROR,
  APPOINTMENT_CONFLICT_ERROR,
  APPOINTMENT_NOT_FOUND_ERROR,
  APPOINTMENT_NOT_STARTED_ERROR,
  cancelAppointmentCore,
  confirmAppointmentCore,
  deleteAppointmentCore,
  recordAppointmentAttendanceCore,
  revalidateCalendarSurfaces,
} from "./appointments-shared";

const WHERE = { id: "appt_1", businessId: "biz_1" };
const RECORD = {
  id: "appt_1",
  clientId: "client_1",
  staffMemberId: "staff_1",
  title: "Checkup",
  startAt: new Date("2026-06-10T09:00:00.000Z"),
};
// deleteAppointmentCore's pre-read select drops `id` (it returns `where.id`
// instead) — a narrower fixture so a future regression reintroducing a read
// of `existing.id` can't hide behind an over-permissive mock.
const DELETE_EXISTING = { clientId: "client_1", staffMemberId: "staff_1" };

/** The guarded update matched a row and cancelled it — the success path. */
function mockGuardHit() {
  mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
  mocks.appointment.findFirstOrThrow.mockResolvedValue(RECORD);
  mocks.appointment.findFirst.mockResolvedValue(null); // refreshClientLastVisitAt's latest-visit lookup
  mocks.client.updateMany.mockResolvedValue({ count: 1 });
  // Slot-fill matching defaults to off (Basic plan) so every pre-existing
  // cancelAppointmentCore test — none of which know about waiting lists —
  // keeps working unchanged; Pro-specific tests below override both.
  mocks.business.findUniqueOrThrow.mockResolvedValue({ plan: "BASIC" });
  mocks.isProBusinessPlan.mockReturnValue(false);
}

/** The guarded update matched nothing — diagnostic lookup returns `status`. */
function mockGuardMiss(status: "COMPLETED" | "CANCELLED" | "CONFIRMED" | "NO_SHOW" | null) {
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
        business: mocks.business,
        waitlistEntry: mocks.waitlistEntry,
        followUpDraft: mocks.followUpDraft,
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
      where: { ...WHERE, status: { notIn: ["COMPLETED", "CANCELLED", "NO_SHOW"] } },
      data: { status: "CANCELLED", cancelledAt: expect.any(Date) },
    });
    // Freezes the schedule as of this cancellation — RECORD.startAt, not
    // whatever startAt might read as later if this booking is edited while
    // still cancelled.
    expect(mocks.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { cancelledScheduledStartAt: RECORD.startAt },
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

  it("refuses to cancel a recorded no-show with 409, without writing anything", async () => {
    // A no-show turned into CANCELLED would vanish from the no-show count and
    // rate; the way back is "Mark as attended", not Cancel.
    mockGuardMiss("NO_SHOW");

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: APPOINTMENT_ALREADY_NO_SHOW_ERROR,
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
        where: expect.objectContaining({ status: { notIn: ["COMPLETED", "CANCELLED", "NO_SHOW"] } }),
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

  it("refuses with a conflict — not a fake success — when the diagnostic read races past CANCELLED", async () => {
    // Codex P2 finding: the guarded update can miss because the row was
    // COMPLETED, but by the time the read-only diagnostic lookup below runs
    // (a separate statement — under READ COMMITTED it can see a later
    // commit than the update did), a concurrent edit has already undone the
    // auto-complete back to CONFIRMED. The old code assumed "not COMPLETED"
    // meant "must be CANCELLED" and returned a fake ok:true/changed:false —
    // silently NOT cancelling an appointment that was actually still
    // CONFIRMED. It must report a conflict instead, exactly like
    // saveAppointmentAction's own guard-miss.
    mockGuardMiss("CONFIRMED");

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: APPOINTMENT_CONFLICT_ERROR,
    });
    expect(mocks.appointmentReminder.deleteMany).not.toHaveBeenCalled();
    expect(mocks.client.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the appointment doesn't exist (or isn't in scope)", async () => {
    mockGuardMiss(null);

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toEqual({ ok: false, status: 404, error: APPOINTMENT_NOT_FOUND_ERROR });
  });

  it("scopes the guarded update by staffMemberId when the mobile caller provides it", async () => {
    mockGuardHit();

    await cancelAppointmentCore({ ...WHERE, staffMemberId: "staff_1" });

    expect(mocks.appointment.updateMany).toHaveBeenCalledWith({
      where: { ...WHERE, staffMemberId: "staff_1", status: { notIn: ["COMPLETED", "CANCELLED", "NO_SHOW"] } },
      data: { status: "CANCELLED", cancelledAt: expect.any(Date) },
    });
  });
});

const WAITLIST_CANDIDATE = {
  id: "wl_1",
  clientId: "client_2",
  service: "Checkup",
  staffMemberId: null,
  earliestDate: null,
  preferredDays: [] as number[],
  preferredFrom: null,
  preferredTo: null,
  createdAt: new Date("2026-01-01"),
};

describe("cancelAppointmentCore — slot-fill matching", () => {
  // A couple of these tests pin APP_TIME_ZONE to prove the weekday/time
  // derivation is zone-aware, not raw UTC — restore whatever was ambient
  // beforehand so this suite can't leak into other files/tests.
  const originalTimeZone = process.env.APP_TIME_ZONE;

  afterEach(() => {
    if (originalTimeZone === undefined) {
      delete process.env.APP_TIME_ZONE;
    } else {
      process.env.APP_TIME_ZONE = originalTimeZone;
    }
  });

  it("does nothing extra when the workspace isn't on Pro", async () => {
    mockGuardHit(); // defaults business plan to BASIC / isProBusinessPlan to false

    await cancelAppointmentCore(WHERE);

    expect(mocks.business.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "biz_1" } })
    );
    expect(mocks.findMatchingWaitlistCandidates).not.toHaveBeenCalled();
    expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
  });

  it("creates one SLOT_OFFER draft and flips the matched entry to OFFERED when a match exists", async () => {
    mockGuardHit();
    mocks.isProBusinessPlan.mockReturnValue(true);
    mocks.business.findUniqueOrThrow.mockResolvedValue({ plan: "PRO" });
    mocks.findMatchingWaitlistCandidates.mockResolvedValue([WAITLIST_CANDIDATE]);
    mocks.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });

    await cancelAppointmentCore(WHERE);

    expect(mocks.findMatchingWaitlistCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_1", service: "Checkup" })
    );
    expect(mocks.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wl_1", status: "WAITING" },
      data: { status: "OFFERED" },
    });
    expect(mocks.followUpDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "SLOT_OFFER",
          clientId: "client_2",
          waitlistEntryId: "wl_1",
          appointmentId: "appt_1",
          dedupeKey: "SLOT_OFFER:appt_1:wl_1",
        }),
      })
    );
  });

  it("creates nothing when no candidate matches", async () => {
    mockGuardHit();
    mocks.isProBusinessPlan.mockReturnValue(true);
    mocks.business.findUniqueOrThrow.mockResolvedValue({ plan: "PRO" });
    mocks.findMatchingWaitlistCandidates.mockResolvedValue([]);

    await cancelAppointmentCore(WHERE);

    expect(mocks.waitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
  });

  it("does not create an orphaned draft when the matched entry was already claimed between the read and the flip", async () => {
    // The status-flip updateMany is its own CAS — a concurrent offer/removal
    // could win the race between findMatchingWaitlistCandidates' read and
    // this write, so `count` comes back 0 (no row still WAITING).
    mockGuardHit();
    mocks.isProBusinessPlan.mockReturnValue(true);
    mocks.business.findUniqueOrThrow.mockResolvedValue({ plan: "PRO" });
    mocks.findMatchingWaitlistCandidates.mockResolvedValue([WAITLIST_CANDIDATE]);
    mocks.waitlistEntry.updateMany.mockResolvedValue({ count: 0 });

    await cancelAppointmentCore(WHERE);

    expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
  });

  it("derives weekday and time-of-day from the clinic's time zone, not raw UTC", async () => {
    process.env.APP_TIME_ZONE = "Europe/Budapest"; // UTC+1 in January — no DST

    mockGuardHit();
    // 23:30 UTC on Wed Jan 14 2026 is 00:30 local Thu Jan 15 in Budapest. A
    // raw-UTC derivation would land this on Wednesday (weekday 2, Mon=0)
    // at 23:30; the zoned derivation correctly lands it on Thursday
    // (weekday 3) at 00:30 — only the zoned result matches this candidate.
    mocks.appointment.findFirstOrThrow.mockResolvedValue({
      ...RECORD,
      startAt: new Date("2026-01-14T23:30:00.000Z"),
    });
    mocks.isProBusinessPlan.mockReturnValue(true);
    mocks.business.findUniqueOrThrow.mockResolvedValue({ plan: "PRO" });
    mocks.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });
    mocks.findMatchingWaitlistCandidates.mockResolvedValue([
      {
        ...WAITLIST_CANDIDATE,
        preferredDays: [3], // Thursday only (Mon=0..Sun=6)
        preferredFrom: "00:00",
        preferredTo: "01:00",
      },
    ]);

    await cancelAppointmentCore(WHERE);

    expect(mocks.followUpDraft.create).toHaveBeenCalled();
  });

  it("does not match when the zoned weekday/time fall outside the candidate's preference", async () => {
    process.env.APP_TIME_ZONE = "Europe/Budapest";

    mockGuardHit();
    // Same instant as above, but the candidate only wants Wednesday — the
    // raw-UTC weekday, not the correct zoned (Thursday) one. If the
    // implementation regressed to raw UTC this would wrongly match.
    mocks.appointment.findFirstOrThrow.mockResolvedValue({
      ...RECORD,
      startAt: new Date("2026-01-14T23:30:00.000Z"),
    });
    mocks.isProBusinessPlan.mockReturnValue(true);
    mocks.business.findUniqueOrThrow.mockResolvedValue({ plan: "PRO" });
    mocks.findMatchingWaitlistCandidates.mockResolvedValue([
      { ...WAITLIST_CANDIDATE, preferredDays: [2] }, // Wednesday only
    ]);

    await cancelAppointmentCore(WHERE);

    expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
  });
});

/** The pre-read finds the row, and the guarded delete matches it — success. */
function mockDeleteGuardHit() {
  mocks.appointment.findFirst
    .mockResolvedValueOnce(DELETE_EXISTING) // the pre-read
    .mockResolvedValueOnce(null); // refreshClientLastVisitAt's latest-visit lookup
  mocks.appointment.deleteMany.mockResolvedValue({ count: 1 });
  mocks.client.updateMany.mockResolvedValue({ count: 1 });
}

describe("revalidateCalendarSurfaces", () => {
  it("refreshes the appointment's edit page along with the other surfaces it feeds", () => {
    revalidateCalendarSurfaces(["client_1"], ["staff_1"], ["appt_1"]);

    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/calendar",
        "/dashboard",
        "/clients",
        "/reports",
        "/staff",
        "/clients/client_1",
        "/staff/staff_1",
        "/calendar/appt_1/edit",
      ])
    );
  });

  it("skips empty ids and revalidates each id once", () => {
    revalidateCalendarSurfaces(["client_1", "client_1", null], [undefined], ["appt_1", "appt_1", undefined]);

    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths.filter((path) => path === "/calendar/appt_1/edit")).toHaveLength(1);
    expect(paths.filter((path) => path === "/clients/client_1")).toHaveLength(1);
    expect(paths.some((path) => String(path).includes("undefined") || String(path).includes("null"))).toBe(false);
  });
});

describe("deleteAppointmentCore", () => {
  it("deletes an appointment and refreshes lastVisitAt", async () => {
    mockDeleteGuardHit();

    const result = await deleteAppointmentCore(WHERE);

    expect(result).toEqual({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: "staff_1",
      changed: true,
    });
    expect(mocks.appointment.deleteMany).toHaveBeenCalledWith({ where: WHERE });
    expect(mocks.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "client_1", businessId: "biz_1" } })
    );
  });

  it("closes the race: a concurrent delete that already won makes this one a typed 404, not an unhandled Prisma throw", async () => {
    // Two admin tabs (or a double-click) both pass the pre-read's existence
    // check; the first request's delete wins and removes the row before this
    // second request's guarded delete runs. Because the guard is the
    // deleteMany's own WHERE match (not `.delete` by id), this call reports
    // `count: 0` instead of Prisma throwing P2025 "Record not found" — the
    // exact throw deleteAppointmentAction has no try/catch for.
    mocks.appointment.findFirst.mockResolvedValueOnce(DELETE_EXISTING); // the pre-read
    mocks.appointment.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteAppointmentCore(WHERE);

    expect(result).toEqual({ ok: false, status: 404, error: APPOINTMENT_NOT_FOUND_ERROR });
    // The loser must not refresh lastVisitAt for a delete that didn't happen.
    expect(mocks.client.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the appointment doesn't exist (or isn't in scope)", async () => {
    mocks.appointment.findFirst.mockResolvedValueOnce(null);

    const result = await deleteAppointmentCore(WHERE);

    expect(result).toEqual({ ok: false, status: 404, error: APPOINTMENT_NOT_FOUND_ERROR });
    expect(mocks.appointment.deleteMany).not.toHaveBeenCalled();
  });

  it("scopes the guarded delete by staffMemberId when the mobile caller provides it", async () => {
    mockDeleteGuardHit();

    await deleteAppointmentCore({ ...WHERE, staffMemberId: "staff_1" });

    expect(mocks.appointment.deleteMany).toHaveBeenCalledWith({
      where: { ...WHERE, staffMemberId: "staff_1" },
    });
  });
});

describe("recordAppointmentAttendanceCore", () => {
  const NOW = new Date("2026-06-01T12:00:00.000Z");
  const STARTED = new Date("2026-06-01T09:00:00.000Z");
  const FUTURE = new Date("2026-06-02T09:00:00.000Z");

  function mockAttendanceMiss(existing: { status: string; startAt: Date } | null) {
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });
    mocks.appointment.findFirst.mockResolvedValue(existing ? { ...RECORD, ...existing } : null);
  }

  it("marks a started appointment as a no-show and refreshes lastVisitAt", async () => {
    mockGuardHit();

    const result = await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW });

    expect(result).toEqual({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: "staff_1",
      changed: true,
    });
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        ...WHERE,
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
        startAt: { lte: NOW },
      },
      data: { status: "NO_SHOW" },
    });
    expect(mocks.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "client_1", businessId: "biz_1" } })
    );
  });

  it("undoes a no-show back to completed", async () => {
    mockGuardHit();

    const result = await recordAppointmentAttendanceCore({ ...WHERE, attended: true, now: NOW });

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith({
      where: { ...WHERE, status: "NO_SHOW" },
      data: { status: "COMPLETED" },
    });
  });

  it("is a no-op success when the appointment is already in the requested state", async () => {
    mockAttendanceMiss({ status: "NO_SHOW", startAt: STARTED });
    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW })).toMatchObject({
      ok: true,
      changed: false,
    });

    mockAttendanceMiss({ status: "COMPLETED", startAt: STARTED });
    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: true, now: NOW })).toMatchObject({
      ok: true,
      changed: false,
    });
    expect(mocks.client.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a no-show for an appointment that has not started", async () => {
    mockAttendanceMiss({ status: "CONFIRMED", startAt: FUTURE });

    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW })).toEqual({
      ok: false,
      status: 409,
      error: APPOINTMENT_NOT_STARTED_ERROR,
    });
  });

  it("refuses to mark a cancelled appointment as a no-show", async () => {
    mockAttendanceMiss({ status: "CANCELLED", startAt: STARTED });

    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW })).toEqual({
      ok: false,
      status: 409,
      error: APPOINTMENT_CANCELLED_NO_SHOW_ERROR,
    });
  });

  it("reports a plain conflict when the row changed underneath the guard", async () => {
    mockAttendanceMiss({ status: "CONFIRMED", startAt: STARTED });

    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW })).toEqual({
      ok: false,
      status: 409,
      error: APPOINTMENT_CONFLICT_ERROR,
    });
  });

  it("returns 404 when the appointment is not in this workspace", async () => {
    mockAttendanceMiss(null);

    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW })).toEqual({
      ok: false,
      status: 404,
      error: APPOINTMENT_NOT_FOUND_ERROR,
    });
  });
});

describe("confirmAppointmentCore", () => {
  it("confirms a pending appointment", async () => {
    mockGuardHit();
    const result = await confirmAppointmentCore(WHERE);
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith({
      where: { ...WHERE, status: "PENDING" },
      data: { status: "CONFIRMED" },
    });
  });

  it("is a no-op success when already confirmed", async () => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });
    mocks.appointment.findFirst.mockResolvedValue({ ...RECORD, status: "CONFIRMED" });
    expect(await confirmAppointmentCore(WHERE)).toMatchObject({ ok: true, changed: false });
  });

  it("returns 404 for an appointment outside this workspace", async () => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });
    mocks.appointment.findFirst.mockResolvedValue(null);
    expect(await confirmAppointmentCore(WHERE)).toEqual({ ok: false, status: 404, error: APPOINTMENT_NOT_FOUND_ERROR });
  });

  it("reports a conflict for anything else (cancelled, completed, no-show)", async () => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });
    mocks.appointment.findFirst.mockResolvedValue({ ...RECORD, status: "CANCELLED" });
    expect(await confirmAppointmentCore(WHERE)).toEqual({ ok: false, status: 409, error: APPOINTMENT_CONFLICT_ERROR });
  });
});
