import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const conversation = { findMany: vi.fn() };
  return { conversation };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: mocks.conversation,
  },
}));

import { fetchInboxConversations } from "./inbox-server";

const BUSINESS_ID = "biz_1";

function conversation(id: string, unreadCount: number, updatedAt: string) {
  return {
    id,
    phoneNumber: "+15551234567",
    contactName: "Client",
    unreadCount,
    updatedAt: new Date(updatedAt),
    messages: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchInboxConversations", () => {
  it("merges an older unread conversation the recency cap left out, without duplicating it", async () => {
    // Codex finding on the unread-count alignment fix: the recency-capped
    // list alone can leave an unread conversation unreachable even though
    // the chip's total counts it — every unread conversation must be
    // included regardless of how recently it was updated.
    const recent = [
      conversation("recent_1", 0, "2026-06-23T10:00:00.000Z"),
      conversation("recent_2", 1, "2026-06-23T09:00:00.000Z"),
    ];
    const unread = [
      // Same conversation as recent_2 — must not appear twice.
      conversation("recent_2", 1, "2026-06-23T09:00:00.000Z"),
      // Older than everything in "recent", so the cap alone would drop it.
      conversation("old_unread", 3, "2026-01-01T00:00:00.000Z"),
    ];
    mocks.conversation.findMany.mockResolvedValueOnce(recent).mockResolvedValueOnce(unread);

    const result = await fetchInboxConversations(BUSINESS_ID);

    expect(result.map((item) => item.id)).toEqual(["recent_1", "recent_2", "old_unread"]);
  });

  it("sorts the merged result by most recently updated", async () => {
    const recent = [conversation("a", 0, "2026-01-01T00:00:00.000Z")];
    const unread = [conversation("b", 2, "2026-06-01T00:00:00.000Z")];
    mocks.conversation.findMany.mockResolvedValueOnce(recent).mockResolvedValueOnce(unread);

    const result = await fetchInboxConversations(BUSINESS_ID);

    expect(result.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("scopes both queries to the given business", async () => {
    mocks.conversation.findMany.mockResolvedValue([]);

    await fetchInboxConversations(BUSINESS_ID);

    expect(mocks.conversation.findMany).toHaveBeenCalledTimes(2);
    for (const [args] of mocks.conversation.findMany.mock.calls) {
      expect(args.where.businessId).toBe(BUSINESS_ID);
    }
    // The second call is the unread-only query.
    expect(mocks.conversation.findMany.mock.calls[1][0].where.unreadCount).toEqual({ gt: 0 });
  });
});
