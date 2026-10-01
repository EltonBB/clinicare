import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const staffMember = {
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  };
  const $transaction = vi.fn();
  const getAuthedBusiness = vi.fn();
  const findStaffAssignedOpenOfferAppointments = vi.fn();
  const retireSlotOffersForAppointments = vi.fn();
  const retireWaitlistEntries = vi.fn();
  const reofferFreedSlots = vi.fn();
  return {
    staffMember,
    $transaction,
    getAuthedBusiness,
    findStaffAssignedOpenOfferAppointments,
    retireSlotOffersForAppointments,
    retireWaitlistEntries,
    reofferFreedSlots,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    staffMember: mocks.staffMember,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/business", () => ({
  getAuthedBusiness: mocks.getAuthedBusiness,
}));

vi.mock("@/lib/slot-offers", () => ({
  findStaffAssignedOpenOfferAppointments: mocks.findStaffAssignedOpenOfferAppointments,
  retireSlotOffersForAppointments: mocks.retireSlotOffersForAppointments,
  retireWaitlistEntries: mocks.retireWaitlistEntries,
  reofferFreedSlots: mocks.reofferFreedSlots,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";

import type { SaveStaffPayload } from "@/lib/staff";

import {
  checkInStaffAction,
  checkOutStaffAction,
  deleteStaffAction,
  generateMobileAccessCodeAction,
  saveStaffAction,
} from "./actions";

const BUSINESS = { id: "biz_1" };
const STAFF_ID = "staff_1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedBusiness.mockResolvedValue({ business: BUSINESS, user: {} });
  mocks.$transaction.mockImplementation(
    async (run: (tx: { staffMember: typeof mocks.staffMember }) => unknown) =>
      run({ staffMember: mocks.staffMember })
  );
  mocks.findStaffAssignedOpenOfferAppointments.mockResolvedValue([]);
  mocks.retireSlotOffersForAppointments.mockResolvedValue(undefined);
  mocks.retireWaitlistEntries.mockResolvedValue([]); // no staff-pinned waiting-list entries by default
  mocks.reofferFreedSlots.mockResolvedValue(undefined);
});

const revalidatedPaths = () => vi.mocked(revalidatePath).mock.calls.map(([path]) => path);

describe("deleteStaffAction", () => {
  it("deletes a staff member and revalidates", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteStaffAction(STAFF_ID);

    expect(result).toEqual({ ok: true, staffId: STAFF_ID });
    expect(mocks.staffMember.deleteMany).toHaveBeenCalledWith({
      where: { id: STAFF_ID, businessId: "biz_1" },
    });
  });

  // Codex #130: a slot offer is live only while its freed appointment's staff
  // member is still available, so removing someone moves the Follow-ups list and
  // the Inbox's follow-up count — both must be revalidated with the roster.
  it("revalidates the Inbox surfaces a removal changes, with the rest of the roster", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.deleteMany.mockResolvedValue({ count: 1 });

    await deleteStaffAction(STAFF_ID);

    expect(revalidatedPaths()).toEqual(
      expect.arrayContaining(["/staff", "/calendar", "/dashboard", "/inbox", "/inbox/follow-ups"])
    );
  });

  it("revalidates nothing when the delete lost the concurrent race", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.deleteMany.mockResolvedValue({ count: 0 });

    await deleteStaffAction(STAFF_ID);

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("closes the race: a concurrent delete that already won makes this one a typed not-found, not an unhandled Prisma throw", async () => {
    // Two admin tabs (or a double-click) both pass the pre-read's existence
    // check; the first request's delete wins and removes the row before this
    // second request's guarded delete runs. Because the guard is the
    // deleteMany's own WHERE match (not `.delete` by id), this call reports
    // `count: 0` instead of Prisma throwing P2025 "Record not found" — the
    // exact throw this action had no try/catch for.
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteStaffAction(STAFF_ID);

    expect(result).toEqual({ ok: false, error: "Staff member not found in this workspace." });
  });

  it("returns not-found when the staff member doesn't exist (or isn't in scope)", async () => {
    mocks.staffMember.findFirst.mockResolvedValue(null);

    const result = await deleteStaffAction(STAFF_ID);

    expect(result).toEqual({ ok: false, error: "Staff member not found in this workspace." });
    expect(mocks.staffMember.deleteMany).not.toHaveBeenCalled();
  });

  // Codex #130: the appointment FK's SET NULL clears staffMemberId the
  // instant this staff row is gone, so a stale offer for one of their freed
  // slots would otherwise start reading as a fresh, genuinely unassigned one.
  it("retires stale slot offers for this staff member's freed appointments, inside the same transaction as the delete", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.deleteMany.mockResolvedValue({ count: 1 });
    mocks.findStaffAssignedOpenOfferAppointments.mockResolvedValue(["appt_1", "appt_2"]);

    const result = await deleteStaffAction(STAFF_ID);

    expect(result).toEqual({ ok: true, staffId: STAFF_ID });
    // Read before the delete, while staffMemberId still points at this staff.
    expect(mocks.findStaffAssignedOpenOfferAppointments).toHaveBeenCalledWith(
      expect.anything(),
      { businessId: "biz_1", staffMemberId: STAFF_ID }
    );
    expect(mocks.findStaffAssignedOpenOfferAppointments.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.staffMember.deleteMany.mock.invocationCallOrder[0]
    );
    // Retired after the delete, so the re-read appointment sees staffMemberId
    // already cleared and offers the slot as genuinely unassigned.
    expect(mocks.retireSlotOffersForAppointments).toHaveBeenCalledWith(
      expect.anything(),
      { businessId: "biz_1", appointmentIds: ["appt_1", "appt_2"] }
    );
    expect(mocks.retireSlotOffersForAppointments.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.staffMember.deleteMany.mock.invocationCallOrder[0]
    );
  });

  // Codex #130: WaitlistEntry.staffMember is SET NULL, and a null staff on an
  // entry means "any staff" to the matcher — so deleting the clinician someone
  // specifically asked for would silently start offering them everyone else's
  // freed slots.
  it("retires the waiting-list entries pinned to this staff member before the delete, in the same transaction", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.deleteMany.mockResolvedValue({ count: 1 });

    await deleteStaffAction(STAFF_ID);

    expect(mocks.retireWaitlistEntries).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1",
      staffMemberId: STAFF_ID,
    });
    expect(mocks.retireWaitlistEntries.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.staffMember.deleteMany.mock.invocationCallOrder[0]
    );
  });

  it("offers the slots freed by those entries' dismissed offers on after the delete, once, alongside the stale ones", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.deleteMany.mockResolvedValue({ count: 1 });
    mocks.findStaffAssignedOpenOfferAppointments.mockResolvedValue(["appt_1", "appt_2"]);
    // appt_2 is in both lists; a null (an offer whose appointment was already
    // gone) has nothing to re-offer.
    mocks.retireWaitlistEntries.mockResolvedValue(["appt_2", null, "appt_3"]);

    await deleteStaffAction(STAFF_ID);

    expect(mocks.retireSlotOffersForAppointments).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1",
      appointmentIds: ["appt_1", "appt_2", "appt_3"],
    });
  });

  it("re-runs the whole deletion once when Postgres aborts the transaction as a deadlock", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.deleteMany.mockResolvedValue({ count: 1 });
    mocks.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock detected", { code: "P2034", clientVersion: "test" })
    );

    const result = await deleteStaffAction(STAFF_ID);

    expect(result).toEqual({ ok: true, staffId: STAFF_ID });
    expect(mocks.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.staffMember.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("skips retirement work when the staff member holds no open slot offers", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.deleteMany.mockResolvedValue({ count: 1 });
    mocks.findStaffAssignedOpenOfferAppointments.mockResolvedValue([]);

    await deleteStaffAction(STAFF_ID);

    expect(mocks.retireSlotOffersForAppointments).toHaveBeenCalledWith(
      expect.anything(),
      { businessId: "biz_1", appointmentIds: [] }
    );
  });

  it("never retires offers when the delete loses the concurrent race", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.deleteMany.mockResolvedValue({ count: 0 });

    await deleteStaffAction(STAFF_ID);

    expect(mocks.retireSlotOffersForAppointments).not.toHaveBeenCalled();
  });
});

describe("saveStaffAction", () => {
  const STAFF_ROW = {
    id: STAFF_ID,
    name: "Dr. Reed",
    role: "Specialist",
    email: null,
    phone: null,
    profileNote: null,
    status: "INACTIVE",
    timeEntries: [],
    shifts: [],
    appointments: [],
  };
  const payload: SaveStaffPayload = {
    id: STAFF_ID,
    name: "Dr. Reed",
    role: "Specialist",
    email: "",
    phone: "",
    profileNote: "",
    status: "INACTIVE",
  };

  // Codex #130: marking someone Inactive makes the slot offers for their
  // appointments stale at once (liveSlotOfferWhere), so the Follow-ups list and
  // the Inbox's follow-up count change with the roster.
  it("revalidates the Inbox surfaces an availability change moves, with the rest of the roster", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
    mocks.staffMember.update.mockResolvedValue({});
    mocks.staffMember.findFirstOrThrow.mockResolvedValue(STAFF_ROW);

    const result = await saveStaffAction(payload);

    expect(result).toMatchObject({ ok: true });
    expect(mocks.staffMember.update).toHaveBeenCalledWith({
      where: { id: STAFF_ID },
      data: expect.objectContaining({ status: "INACTIVE", isActive: false }),
    });
    expect(revalidatedPaths()).toEqual(
      expect.arrayContaining([`/staff/${STAFF_ID}`, "/calendar", "/dashboard", "/inbox", "/inbox/follow-ups"])
    );
  });

  // Codex #130: an entry pinned to a member who is then set Inactive can never be
  // offered a slot (offerFreedSlot refuses theirs), yet it would keep showing on
  // the waiting list and counting against its cap until removed by hand.
  describe("saving a member as Inactive", () => {
    beforeEach(() => {
      mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
      mocks.staffMember.update.mockResolvedValue({});
      mocks.staffMember.findFirstOrThrow.mockResolvedValue(STAFF_ROW);
    });

    it("retires the entries pinned to them and offers the freed slots on, in the same transaction as the status change", async () => {
      mocks.retireWaitlistEntries.mockResolvedValue(["appt_1", null]);

      const result = await saveStaffAction(payload);

      expect(result).toMatchObject({ ok: true });
      expect(mocks.$transaction).toHaveBeenCalledTimes(1);
      expect(mocks.retireWaitlistEntries).toHaveBeenCalledWith(expect.anything(), {
        businessId: "biz_1",
        staffMemberId: STAFF_ID,
      });
      expect(mocks.reofferFreedSlots).toHaveBeenCalledWith(expect.anything(), {
        businessId: "biz_1",
        appointmentIds: ["appt_1", null],
      });
      // Status first, so the re-offer sees them as unavailable; the re-offer last,
      // so what it offers on reflects the retirement.
      const [update, retire, reoffer] = [
        mocks.staffMember.update,
        mocks.retireWaitlistEntries,
        mocks.reofferFreedSlots,
      ].map((fn) => fn.mock.invocationCallOrder[0]);
      expect(update).toBeLessThan(retire);
      expect(retire).toBeLessThan(reoffer);
    });

    it("re-runs the whole save once when Postgres aborts the transaction as a deadlock", async () => {
      mocks.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("deadlock detected", { code: "P2034", clientVersion: "test" })
      );

      const result = await saveStaffAction(payload);

      expect(result).toMatchObject({ ok: true });
      expect(mocks.$transaction).toHaveBeenCalledTimes(2);
      expect(mocks.retireWaitlistEntries).toHaveBeenCalledTimes(1);
    });

    it("answers with the generic error and leaves the waiting list alone when the transaction fails", async () => {
      mocks.retireWaitlistEntries.mockRejectedValue(new Error("connection reset"));

      const result = await saveStaffAction(payload);

      expect(result).toMatchObject({ ok: false });
      expect(mocks.reofferFreedSlots).not.toHaveBeenCalled();
    });

    it("does nothing to the waiting list for a member who doesn't exist in this workspace", async () => {
      mocks.staffMember.findFirst.mockResolvedValue(null);

      const result = await saveStaffAction(payload);

      expect(result).toMatchObject({ ok: false });
      expect(mocks.$transaction).not.toHaveBeenCalled();
      expect(mocks.retireWaitlistEntries).not.toHaveBeenCalled();
    });

    it("leaves a brand-new member's save alone: nothing can be pinned to them yet", async () => {
      mocks.staffMember.create.mockResolvedValue({ id: "staff_new" });
      mocks.staffMember.findFirstOrThrow.mockResolvedValue({ ...STAFF_ROW, id: "staff_new" });

      await saveStaffAction({ ...payload, id: "" });

      expect(mocks.staffMember.create).toHaveBeenCalledTimes(1);
      expect(mocks.$transaction).not.toHaveBeenCalled();
      expect(mocks.retireWaitlistEntries).not.toHaveBeenCalled();
    });
  });

  it.each(["ACTIVE", "AWAY"] as const)(
    "saving a member as %s is a plain update that touches no waiting-list entry (they stay available)",
    async (status) => {
      mocks.staffMember.findFirst.mockResolvedValue({ id: STAFF_ID });
      mocks.staffMember.update.mockResolvedValue({});
      mocks.staffMember.findFirstOrThrow.mockResolvedValue({ ...STAFF_ROW, status });

      const result = await saveStaffAction({ ...payload, status });

      expect(result).toMatchObject({ ok: true });
      expect(mocks.staffMember.update).toHaveBeenCalledWith({
        where: { id: STAFF_ID },
        data: expect.objectContaining({ status, isActive: true }),
      });
      expect(mocks.$transaction).not.toHaveBeenCalled();
      expect(mocks.retireWaitlistEntries).not.toHaveBeenCalled();
      expect(mocks.reofferFreedSlots).not.toHaveBeenCalled();
    }
  );
});

describe("generateMobileAccessCodeAction", () => {
  it("refuses to issue a code when the staff member is inactive", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({
      id: STAFF_ID,
      isActive: false,
      status: "INACTIVE",
    });

    const result = await generateMobileAccessCodeAction(STAFF_ID);

    expect(result).toEqual({
      ok: false,
      error: "Mobile access can't be issued to an inactive staff member.",
    });
  });

  it("refuses even if isActive has drifted true for an INACTIVE status record", async () => {
    // isActive is derived from status at save time (status !== "INACTIVE"), but
    // isn't a DB-enforced invariant — a record last saved before that logic
    // existed (or edited outside saveStaffAction) can have the two disagree.
    // The guard must catch either half, since requireStaffContext (which every
    // subsequent mobile call goes through) checks both the same way.
    mocks.staffMember.findFirst.mockResolvedValue({
      id: STAFF_ID,
      isActive: true,
      status: "INACTIVE",
    });

    const result = await generateMobileAccessCodeAction(STAFF_ID);

    expect(result).toEqual({
      ok: false,
      error: "Mobile access can't be issued to an inactive staff member.",
    });
  });
});

// Server actions take client-serialized arguments: an object id like
// `{ not: "" }` would reach Prisma's `where` as a filter over the workspace.
describe("staff actions refuse a non-string id before touching the database", () => {
  const CRAFTED_ID = { not: "" } as unknown as string;

  function expectNoStaffQuery() {
    for (const fn of Object.values(mocks.staffMember)) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(mocks.$transaction).not.toHaveBeenCalled();
  }

  it.each([
    ["delete (would remove every staff member)", deleteStaffAction],
    ["check in (would open a time entry for every staff member)", checkInStaffAction],
    ["check out (would close every open time entry)", checkOutStaffAction],
  ])("%s", async (_name, action) => {
    expect(await action(CRAFTED_ID)).toEqual({ ok: false, error: "Staff member not found in this workspace." });
    expectNoStaffQuery();
  });

  it("save (would update every staff member), with a crafted id in the payload", async () => {
    const payload: SaveStaffPayload = {
      id: CRAFTED_ID,
      name: "Dr. Arben Hoxha",
      role: "Dentist",
      email: "",
      phone: "",
      profileNote: "",
      status: "ACTIVE",
    };

    expect(await saveStaffAction(payload)).toEqual({ ok: false, error: "Staff member not found in this workspace." });
    expectNoStaffQuery();
  });

  it("mobile access", async () => {
    expect(await generateMobileAccessCodeAction(CRAFTED_ID)).toEqual({ ok: false, error: "Staff member not found." });
    expect(mocks.getAuthedBusiness).not.toHaveBeenCalled();
    expect(mocks.staffMember.findFirst).not.toHaveBeenCalled();
  });
});
