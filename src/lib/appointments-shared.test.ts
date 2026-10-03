import { Prisma } from "@prisma/client";
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
  // The slot-offer models live on the TRANSACTION client only, and the outer
  // client gets its own separate copies — so a test can prove the plan
  // re-check, the match read, the entry flip and the draft insert all ran on
  // `tx` (atomic with the cancel), never on the outer client.
  const business = { findUniqueOrThrow: vi.fn() };
  const waitlistEntry = { findMany: vi.fn(), updateMany: vi.fn() };
  const followUpDraft = { createMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() };
  const scheduleBlock = { findFirst: vi.fn() };
  const staffMember = { findFirst: vi.fn() };
  const businessHours = { findUnique: vi.fn() };
  const $executeRaw = vi.fn();
  const outer = {
    business: { findUniqueOrThrow: vi.fn() },
    waitlistEntry: { findMany: vi.fn(), updateMany: vi.fn() },
    followUpDraft: { createMany: vi.fn() },
  };
  const $transaction = vi.fn();
  const revalidatePath = vi.fn();
  return {
    appointment,
    appointmentReminder,
    client,
    business,
    waitlistEntry,
    followUpDraft,
    scheduleBlock,
    staffMember,
    businessHours,
    $executeRaw,
    outer,
    $transaction,
    revalidatePath,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: mocks.appointment,
    appointmentReminder: mocks.appointmentReminder,
    client: mocks.client,
    business: mocks.outer.business,
    waitlistEntry: mocks.outer.waitlistEntry,
    followUpDraft: mocks.outer.followUpDraft,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/mobile/push", () => ({
  buildStaffPushPayload: vi.fn(),
  sendStaffPush: vi.fn(),
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
  endAt: new Date("2026-06-10T09:30:00.000Z"),
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
  // keeps working unchanged; Pro-specific tests below override it.
  mocks.business.findUniqueOrThrow.mockResolvedValue({ plan: "BASIC" });
}

/** The guarded update matched nothing — diagnostic lookup returns `status`. */
function mockGuardMiss(status: "COMPLETED" | "CANCELLED" | "CONFIRMED" | "NO_SHOW" | null) {
  mocks.appointment.updateMany.mockResolvedValue({ count: 0 });
  mocks.appointment.findFirst.mockResolvedValue(status ? { ...RECORD, status } : null);
}

// tx.appointment.findFirst serves multiple real queries here:
// refreshClientLastVisitAt's latest-visit lookup (status: {in:[...]}), the
// dedupe-key cycle read inside offerFreedSlot (no status filter), and — since
// the centralized availability check landed inside offerFreedSlot too (Codex
// #130) — hasSchedulingConflict's own overlap query (status: {not:
// "CANCELLED"}). Distinguishable by that shape, so one mock serves all of
// them instead of the tests needing to track call order.
function serveAppointmentReads(options: { read?: Record<string, unknown> | null; conflict?: unknown } = {}) {
  const { read = null, conflict = null } = options;
  mocks.appointment.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const status = where.status as { not?: string } | { in?: string[] } | undefined;
    if (status && typeof status === "object" && "not" in status && status.not === "CANCELLED") {
      return conflict;
    }
    return read;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // No open slot offers unless a test adds one (deleteAppointmentCore's withdraw).
  mocks.followUpDraft.findMany.mockResolvedValue([]);
  mocks.scheduleBlock.findFirst.mockResolvedValue(null); // no business-wide block by default
  mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" }); // the freed slot's staff is available by default
  mocks.businessHours.findUnique.mockResolvedValue({ isOpen: true, startTime: "00:00", endTime: "23:59" }); // open all day by default
  mocks.$executeRaw.mockResolvedValue(undefined);
  mocks.$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) =>
      cb({
        appointment: mocks.appointment,
        appointmentReminder: mocks.appointmentReminder,
        client: mocks.client,
        business: mocks.business,
        waitlistEntry: mocks.waitlistEntry,
        followUpDraft: mocks.followUpDraft,
        scheduleBlock: mocks.scheduleBlock,
        staffMember: mocks.staffMember,
        businessHours: mocks.businessHours,
        $executeRaw: mocks.$executeRaw,
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

  it("re-runs the whole transaction once when Postgres aborts it as a deadlock, then succeeds", async () => {
    mockGuardHit();
    // Cancel takes row locks (the appointment, the client's last-visit refresh)
    // before offerFreedSlot takes the staff member's advisory lock, while a
    // booking takes that advisory lock first: Postgres breaks the cycle by
    // aborting one side.
    mocks.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock detected", { code: "P2034", clientVersion: "test" })
    );

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.$transaction).toHaveBeenCalledTimes(2);
    // The aborted attempt never ran; the cancel itself was written exactly once.
    expect(mocks.appointment.updateMany).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failure that isn't a deadlock", async () => {
    mocks.$transaction.mockRejectedValueOnce(new Error("connection reset"));

    await expect(cancelAppointmentCore(WHERE)).rejects.toThrow("connection reset");
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
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

// A findMany row as findMatchingWaitlistCandidates reads it (client name joined).
const WAITLIST_ROW = {
  id: "wl_1",
  clientId: "client_2",
  service: "Checkup",
  staffMemberId: null,
  earliestDate: null,
  preferredDays: [] as number[],
  preferredFrom: null,
  preferredTo: null,
  createdAt: new Date("2026-01-01"),
  client: { name: "Mira" },
};

describe("cancelAppointmentCore — slot-fill matching", () => {
  // A couple of these tests pin APP_TIME_ZONE to prove the weekday/time
  // derivation is zone-aware, not raw UTC — restore whatever was ambient
  // beforehand so this suite can't leak into other files/tests.
  const originalTimeZone = process.env.APP_TIME_ZONE;

  beforeEach(() => {
    // The fixtures' slots (June 2026, Jan 14 2026) must still be ahead —
    // a slot that already started is never offered.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTimeZone === undefined) {
      delete process.env.APP_TIME_ZONE;
    } else {
      process.env.APP_TIME_ZONE = originalTimeZone;
    }
  });

  // The cancellation cycle offerFreedSlot reads from the appointment row.
  const CANCELLED_AT = new Date("2026-01-01T00:00:10.000Z");

  function mockPro() {
    serveAppointmentReads({ read: { updatedAt: CANCELLED_AT } });
    mocks.business.findUniqueOrThrow.mockResolvedValue({ plan: "PRO" });
    mocks.followUpDraft.findFirst.mockResolvedValue(null); // no live offer for this slot yet
    mocks.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });
    mocks.followUpDraft.createMany.mockResolvedValue({ count: 1 });
  }

  it("does nothing extra when the workspace isn't on Pro", async () => {
    mockGuardHit(); // defaults business plan to BASIC

    await cancelAppointmentCore(WHERE);

    expect(mocks.business.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "biz_1" } })
    );
    expect(mocks.waitlistEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("runs the plan re-check, the match, the entry flip and the draft insert on the cancel's own transaction", async () => {
    mockGuardHit();
    mockPro();
    mocks.waitlistEntry.findMany.mockResolvedValue([WAITLIST_ROW]);

    await cancelAppointmentCore(WHERE);

    expect(mocks.business.findUniqueOrThrow).toHaveBeenCalled();
    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz_1",
          // Never offered back to the client who just cancelled it.
          clientId: { not: "client_1" },
          client: {
            isArchived: false,
            status: { notIn: ["INACTIVE", "ARCHIVED"] },
            followUpDrafts: {
              none: { kind: "SLOT_OFFER", appointmentId: "appt_1", status: { in: ["PENDING", "SENT", "DISMISSED"] } },
            },
          },
        }),
      })
    );
    expect(mocks.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wl_1", businessId: "biz_1", status: "WAITING" },
      data: { status: "OFFERED" },
    });
    expect(mocks.followUpDraft.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          kind: "SLOT_OFFER",
          clientId: "client_2",
          waitlistEntryId: "wl_1",
          appointmentId: "appt_1",
          // Names the cancellation cycle (the row's updatedAt), so a later cancel of the same slot gets a fresh key.
          dedupeKey: `SLOT_OFFER:appt_1:${CANCELLED_AT.getTime()}:wl_1`,
        }),
      ],
      skipDuplicates: true,
    });
    // Nothing touched the outer client — it's all atomic with the cancel.
    expect(mocks.outer.business.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.outer.waitlistEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.outer.waitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.outer.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("drafts a minimum-necessary offer: the waiting client's name and the slot's time, never the service", async () => {
    process.env.APP_TIME_ZONE = "Europe/Budapest";
    mockGuardHit();
    mockPro();
    mocks.waitlistEntry.findMany.mockResolvedValue([WAITLIST_ROW]);

    await cancelAppointmentCore(WHERE);

    const [{ data }] = mocks.followUpDraft.createMany.mock.calls[0];
    // RECORD.startAt is 09:00 UTC on June 10 = 11:00 in Budapest (CEST).
    expect(data[0].body).toBe("Hi Mira, a slot has opened up on June 10, 2026 at 11:00 AM. Reply here if you'd like it.");
    expect(data[0].body).not.toContain("Checkup");
  });

  it("offers nothing for a slot that has already started", async () => {
    mockGuardHit();
    mockPro();
    mocks.waitlistEntry.findMany.mockResolvedValue([WAITLIST_ROW]);
    vi.setSystemTime(new Date("2026-06-10T09:00:00.000Z")); // RECORD's own start

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.waitlistEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("re-cancelling a slot that still has a live offer doesn't offer it to a second patient", async () => {
    mockGuardHit();
    mockPro();
    mocks.followUpDraft.findFirst.mockResolvedValue({ id: "d_live" });
    mocks.waitlistEntry.findMany.mockResolvedValue([WAITLIST_ROW]);

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.followUpDraft.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz_1", appointmentId: "appt_1" }) })
    );
    expect(mocks.waitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("creates nothing when no candidate matches", async () => {
    mockGuardHit();
    mockPro();
    mocks.waitlistEntry.findMany.mockResolvedValue([]);

    await cancelAppointmentCore(WHERE);

    expect(mocks.waitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  // Codex #130: cancelling a booking whose staff member has since been
  // deactivated is allowed, but the freed slot can't be honored — Book refuses
  // it — so nothing is offered for it.
  it("completes the cancel but offers nothing when the booking's staff member is no longer available", async () => {
    mockGuardHit();
    mockPro();
    mocks.staffMember.findFirst.mockResolvedValue(null);
    mocks.waitlistEntry.findMany.mockResolvedValue([
      { id: "wl_1", clientId: "client_wl", service: "Checkup", staffMemberId: null, earliestDate: null, preferredDays: [], preferredFrom: null, preferredTo: null, createdAt: new Date("2026-01-01T00:00:00Z"), client: { name: "Mira" } },
    ]);

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.waitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  // Codex #130: working hours can shrink after a booking was made; the freed
  // slot is then one the calendar would refuse to book, so it isn't offered.
  it("completes the cancel but offers nothing when the slot is outside the clinic's working hours now", async () => {
    mockGuardHit();
    mockPro();
    mocks.businessHours.findUnique.mockResolvedValue({ isOpen: false, startTime: "08:00", endTime: "20:00" });
    mocks.waitlistEntry.findMany.mockResolvedValue([
      { id: "wl_1", clientId: "client_wl", service: "Checkup", staffMemberId: null, earliestDate: null, preferredDays: [], preferredFrom: null, preferredTo: null, createdAt: new Date("2026-01-01T00:00:00Z"), client: { name: "Mira" } },
    ]);

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.businessHours.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.waitlistEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("does not create an orphaned draft when the matched entry was already claimed between the read and the flip", async () => {
    // The status-flip updateMany is its own CAS — a concurrent offer/removal
    // could win the race between the candidate read and this write, so
    // `count` comes back 0 (no row still WAITING).
    mockGuardHit();
    mockPro();
    mocks.waitlistEntry.findMany.mockResolvedValue([WAITLIST_ROW]);
    mocks.waitlistEntry.updateMany.mockResolvedValue({ count: 0 });

    await cancelAppointmentCore(WHERE);

    expect(mocks.followUpDraft.createMany).not.toHaveBeenCalled();
  });

  it("still completes the cancel cleanly when the offer's draft already exists (dedupe collision)", async () => {
    mockGuardHit();
    mockPro();
    mocks.waitlistEntry.findMany.mockResolvedValue([WAITLIST_ROW]);
    mocks.followUpDraft.createMany.mockResolvedValue({ count: 0 });

    const result = await cancelAppointmentCore(WHERE);

    expect(result).toMatchObject({ ok: true, changed: true });
    // The entry isn't left OFFERED without a live draft.
    expect(mocks.waitlistEntry.updateMany).toHaveBeenLastCalledWith({
      where: { id: "wl_1", businessId: "biz_1", status: "OFFERED" },
      data: { status: "WAITING" },
    });
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
      endAt: new Date("2026-01-15T00:00:00.000Z"), // a 30-minute slot, so the working-hours check sees a real length
    });
    mockPro();
    mocks.waitlistEntry.findMany.mockResolvedValue([
      {
        ...WAITLIST_ROW,
        preferredDays: [3], // Thursday only (Mon=0..Sun=6)
        preferredFrom: "00:00",
        preferredTo: "01:00",
      },
    ]);

    await cancelAppointmentCore(WHERE);

    expect(mocks.followUpDraft.createMany).toHaveBeenCalled();
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
      endAt: new Date("2026-01-15T00:00:00.000Z"), // a 30-minute slot, so the working-hours check sees a real length
    });
    mockPro();
    mocks.waitlistEntry.findMany.mockResolvedValue([
      { ...WAITLIST_ROW, preferredDays: [2] }, // Wednesday only
    ]);

    await cancelAppointmentCore(WHERE);

    expect(mocks.followUpDraft.createMany).not.toHaveBeenCalled();
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

  it("re-runs the transaction once when Postgres aborts it as a deadlock, then deletes", async () => {
    mockDeleteGuardHit();
    mocks.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock detected", { code: "P2034", clientVersion: "test" })
    );

    const result = await deleteAppointmentCore(WHERE);

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.appointment.deleteMany).toHaveBeenCalledTimes(1);
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
    // ...and its transaction is rolled back (the callback threw), so the
    // slot-offer withdraw that ran first doesn't stick either.
    await expect(mocks.$transaction.mock.results[0].value).rejects.toThrow();
  });

  it("withdraws the appointment's open waiting-list offer inside the delete's transaction, before the row goes", async () => {
    mockDeleteGuardHit();
    mocks.followUpDraft.findMany.mockResolvedValue([{ id: "d_offer", businessId: "biz_1", waitlistEntryId: "wl_1" }]);
    mocks.followUpDraft.updateMany.mockResolvedValue({ count: 1 });
    mocks.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await deleteAppointmentCore(WHERE);

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.followUpDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: "biz_1", kind: "SLOT_OFFER", appointmentId: "appt_1" }),
      })
    );
    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "d_offer" }), data: { status: "EXPIRED" } })
    );
    expect(mocks.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wl_1", businessId: "biz_1", status: "OFFERED" },
      data: { status: "WAITING" },
    });
    // Withdrawn first — the FK's SET NULL would unlink the draft once the row is deleted.
    expect(mocks.followUpDraft.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.appointment.deleteMany.mock.invocationCallOrder[0]
    );
    // All on the transaction client.
    expect(mocks.outer.waitlistEntry.updateMany).not.toHaveBeenCalled();
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
