import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const staffMember = {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  };
  const getAuthedBusiness = vi.fn();
  return { staffMember, getAuthedBusiness };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    staffMember: mocks.staffMember,
  },
}));

vi.mock("@/lib/business", () => ({
  getAuthedBusiness: mocks.getAuthedBusiness,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteStaffAction } from "./actions";

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
