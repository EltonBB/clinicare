import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const staffTimeEntry = { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() };
  const staffShift = { findMany: vi.fn() };
  return { staffTimeEntry, staffShift };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { staffTimeEntry: mocks.staffTimeEntry, staffShift: mocks.staffShift },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { clockStaff, closeOpenTimeEntryIfPresent } from "./clock";
import type { StaffContext } from "@/lib/staff-auth";

const BUSINESS_ID = "biz_1";
const STAFF_ID = "staff_1";
const OPEN_ENTRY = {
  id: "entry_1",
  businessId: BUSINESS_ID,
  staffMemberId: STAFF_ID,
  checkedInAt: new Date("2026-06-01T09:00:00Z"),
  checkedOutAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("closeOpenTimeEntryIfPresent", () => {
  it("returns false and writes nothing when nothing is open", async () => {
    mocks.staffTimeEntry.findFirst.mockResolvedValue(null);

    const result = await closeOpenTimeEntryIfPresent(BUSINESS_ID, STAFF_ID);

    expect(result).toBe(false);
    expect(mocks.staffTimeEntry.updateMany).not.toHaveBeenCalled();
  });

  it("closes the open entry via a guarded updateMany and returns true", async () => {
    mocks.staffTimeEntry.findFirst.mockResolvedValue(OPEN_ENTRY);
    mocks.staffTimeEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await closeOpenTimeEntryIfPresent(BUSINESS_ID, STAFF_ID);

    expect(result).toBe(true);
    expect(mocks.staffTimeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "entry_1", checkedOutAt: null },
      data: { checkedOutAt: expect.any(Date) },
    });
  });

  it("still returns true when a concurrent closer already won the race — goal satisfied either way", async () => {
    // Simulates the stale-entry sweep (autoCloseStaleTimeEntries) or a second
    // tap closing this exact row between the read above and this write — the
    // guarded updateMany affects 0 rows, but checkedOutAt only ever moves
    // null -> set, never back, so a guard-miss here can only mean "someone
    // else already closed it." The caller's actual goal (checked out) is
    // still satisfied, so this must report success, not retry with an
    // unconditional overwrite.
    mocks.staffTimeEntry.findFirst.mockResolvedValue(OPEN_ENTRY);
    mocks.staffTimeEntry.updateMany.mockResolvedValue({ count: 0 });

    const result = await closeOpenTimeEntryIfPresent(BUSINESS_ID, STAFF_ID);

    expect(result).toBe(true);
    // The critical assertion: only the guarded updateMany ran — nothing else
    // attempted an unconditional overwrite of the row.
    expect(mocks.staffTimeEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.staffTimeEntry.update).not.toHaveBeenCalled();
  });

  it("scopes the read by businessId and staffMemberId, picking the most recent open entry", async () => {
    mocks.staffTimeEntry.findFirst.mockResolvedValue(OPEN_ENTRY);
    mocks.staffTimeEntry.updateMany.mockResolvedValue({ count: 1 });

    await closeOpenTimeEntryIfPresent(BUSINESS_ID, STAFF_ID);

    expect(mocks.staffTimeEntry.findFirst).toHaveBeenCalledWith({
      where: { businessId: BUSINESS_ID, staffMemberId: STAFF_ID, checkedOutAt: null },
      orderBy: { checkedInAt: "desc" },
    });
  });
});

describe("clockStaff — check-out", () => {
  const ctx = {
    business: { id: BUSINESS_ID },
    staffMember: { id: STAFF_ID, isActive: true, status: "ACTIVE" },
    device: { id: "device_1" },
  } as unknown as StaffContext;

  it("closes the open entry and reports checkedIn: false", async () => {
    mocks.staffTimeEntry.findFirst.mockResolvedValue(OPEN_ENTRY);
    mocks.staffTimeEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await clockStaff(ctx, "out");

    expect(result).toEqual({ ok: true, checkedIn: false });
    expect(mocks.staffTimeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "entry_1", checkedOutAt: null },
      data: { checkedOutAt: expect.any(Date) },
    });
  });

  it("is a silent no-op success when nothing was open to close — unchanged from before this fix", async () => {
    mocks.staffTimeEntry.findFirst.mockResolvedValue(null);

    const result = await clockStaff(ctx, "out");

    expect(result).toEqual({ ok: true, checkedIn: false });
    expect(mocks.staffTimeEntry.updateMany).not.toHaveBeenCalled();
  });

  it("still reports success when a concurrent closer wins the race", async () => {
    mocks.staffTimeEntry.findFirst.mockResolvedValue(OPEN_ENTRY);
    mocks.staffTimeEntry.updateMany.mockResolvedValue({ count: 0 });

    const result = await clockStaff(ctx, "out");

    expect(result).toEqual({ ok: true, checkedIn: false });
  });

  it("refuses an inactive staff member before touching the DB", async () => {
    const inactiveCtx = {
      ...ctx,
      staffMember: { ...ctx.staffMember, isActive: false },
    } as unknown as StaffContext;

    const result = await clockStaff(inactiveCtx, "out");

    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(mocks.staffTimeEntry.findFirst).not.toHaveBeenCalled();
  });
});
