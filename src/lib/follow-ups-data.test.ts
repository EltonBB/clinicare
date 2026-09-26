import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  followUpDraft: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import { dismissFollowUpDraft, getPendingFollowUpDraftCount, listPendingFollowUpDrafts, markFollowUpDraftSent } from "@/lib/follow-ups-data";

beforeEach(() => vi.clearAllMocks());

describe("follow-ups data layer", () => {
  it("counts only PENDING drafts scoped to the business", async () => {
    mocks.followUpDraft.count.mockResolvedValue(3);
    await getPendingFollowUpDraftCount("biz_1");
    expect(mocks.followUpDraft.count).toHaveBeenCalledWith({ where: { businessId: "biz_1", status: "PENDING" } });
  });

  it("lists PENDING drafts plus SENT slot offers still awaiting a booking, scoped to the business", async () => {
    mocks.followUpDraft.findMany.mockResolvedValue([]);
    await listPendingFollowUpDrafts("biz_1");
    expect(mocks.followUpDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz_1",
          OR: [
            { status: "PENDING" },
            { status: "SENT", kind: "SLOT_OFFER", waitlistEntry: { status: "OFFERED" } },
          ],
        },
      })
    );
  });

  it("caps the pending-drafts query at MAX_PENDING_FOLLOW_UPS (200) instead of querying unbounded", async () => {
    mocks.followUpDraft.findMany.mockResolvedValue([]);
    await listPendingFollowUpDrafts("biz_1");
    expect(mocks.followUpDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 })
    );
  });

  it("flips PENDING to SENT atomically and reports a plain error if it was already handled", async () => {
    mocks.followUpDraft.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await markFollowUpDraftSent({ id: "d1", businessId: "biz_1" })).toEqual({ ok: true });
    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1", businessId: "biz_1", status: "PENDING" } })
    );

    mocks.followUpDraft.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await markFollowUpDraftSent({ id: "d1", businessId: "biz_1" })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });

  it("dismisses the same way", async () => {
    mocks.followUpDraft.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1" })).toEqual({ ok: true });

    mocks.followUpDraft.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1" })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });
});
