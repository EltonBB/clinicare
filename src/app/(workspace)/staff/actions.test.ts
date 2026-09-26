import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const staffMember = {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  };
  const $transaction = vi.fn();
  const getAuthedBusiness = vi.fn();
  return { staffMember, $transaction, getAuthedBusiness };
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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
});

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
