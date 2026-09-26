import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  waitlistEntry: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import {
  createWaitlistEntry,
  findMatchingWaitlistCandidates,
  listWaitingEntries,
  removeWaitlistEntry,
} from "@/lib/waitlist-data";

beforeEach(() => vi.clearAllMocks());

describe("waitlist data layer", () => {
  it("lists only WAITING entries for the business, oldest first", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([]);
    await listWaitingEntries("biz_1");
    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: "biz_1", status: "WAITING" }, orderBy: { createdAt: "asc" } })
    );
  });

  it("creates an entry scoped to the business", async () => {
    mocks.waitlistEntry.create.mockResolvedValue({ id: "wl_1" });
    const result = await createWaitlistEntry({
      businessId: "biz_1", clientId: "client_1", service: "Checkup",
      staffMemberId: null, earliestDate: null, preferredDays: [], preferredFrom: null, preferredTo: null, notes: null,
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.waitlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessId: "biz_1", clientId: "client_1", service: "Checkup", status: "WAITING" }) })
    );
  });

  it("removes an entry via a CAS-guarded update (status -> REMOVED), reporting a plain error if already gone", async () => {
    mocks.waitlistEntry.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await removeWaitlistEntry({ id: "wl_1", businessId: "biz_1" })).toEqual({ ok: true });

    mocks.waitlistEntry.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await removeWaitlistEntry({ id: "wl_1", businessId: "biz_1" })).toEqual({
      ok: false,
      error: "This waiting-list entry was already removed.",
    });
  });

  it("finds only WAITING candidates matching the given service, scoped to the business", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([]);
    await findMatchingWaitlistCandidates({ businessId: "biz_1", service: "Checkup" });
    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz_1", status: "WAITING" }) })
    );
  });
});
