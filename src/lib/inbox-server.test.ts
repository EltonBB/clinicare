import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const conversation = { findMany: vi.fn(), aggregate: vi.fn() };
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

// The second (unread-merge) query only runs when `recent`'s own unread sum
// falls short of the business-wide total — set the aggregate explicitly in
// every test so that decision is deliberate, not accidental.
function mockTotalUnread(total: number) {
  mocks.conversation.aggregate.mockResolvedValue({ _sum: { unreadCount: total } });
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
    // recent's own unread sum (1) is short of the business-wide total (4),
    // so the merge query must run.
    mockTotalUnread(4);

    const { conversations } = await fetchInboxConversations(BUSINESS_ID);

    expect(conversations.map((item) => item.id)).toEqual(["recent_1", "recent_2", "old_unread"]);
  });

  it("sorts the merged result by most recently updated", async () => {
    const recent = [conversation("a", 0, "2026-01-01T00:00:00.000Z")];
    const unread = [conversation("b", 2, "2026-06-01T00:00:00.000Z")];
    mocks.conversation.findMany.mockResolvedValueOnce(recent).mockResolvedValueOnce(unread);
    mockTotalUnread(2);

    const { conversations } = await fetchInboxConversations(BUSINESS_ID);

    expect(conversations.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("scopes both queries to the given business", async () => {
    mocks.conversation.findMany.mockResolvedValue([]);
    // Force the merge query to run so both `findMany` calls happen.
    mockTotalUnread(1);

    await fetchInboxConversations(BUSINESS_ID);

    expect(mocks.conversation.findMany).toHaveBeenCalledTimes(2);
    for (const [args] of mocks.conversation.findMany.mock.calls) {
      expect(args.where.businessId).toBe(BUSINESS_ID);
    }
    // The second call is the unread-only query.
    expect(mocks.conversation.findMany.mock.calls[1][0].where.unreadCount).toEqual({ gt: 0 });
  });

  it("does not cap the unread-only query by count", async () => {
    // Codex's follow-up finding: a numeric `take` here just moves the same
    // "chip counts more than the filter can show" bug to a higher threshold
    // instead of closing it — the query must have no count ceiling at all.
    mocks.conversation.findMany.mockResolvedValue([]);
    mockTotalUnread(1);

    await fetchInboxConversations(BUSINESS_ID);

    const unreadQueryArgs = mocks.conversation.findMany.mock.calls[1][0];
    expect(unreadQueryArgs.take).toBeUndefined();
  });

  it("marks recent conversations as full history and extra unread ones as a preview only", async () => {
    const recent = [conversation("recent_1", 0, "2026-06-23T10:00:00.000Z")];
    const unread = [conversation("old_unread", 3, "2026-01-01T00:00:00.000Z")];
    mocks.conversation.findMany.mockResolvedValueOnce(recent).mockResolvedValueOnce(unread);
    mockTotalUnread(3);

    const { conversations } = await fetchInboxConversations(BUSINESS_ID);

    expect(conversations.find((item) => item.id === "recent_1")?.hasFullHistory).toBe(true);
    expect(conversations.find((item) => item.id === "old_unread")?.hasFullHistory).toBe(false);
  });

  it("fetches far fewer messages per conversation for the unread-only query than the recent one", async () => {
    // The "extra" entries are previews the client hydrates on open (see
    // hydrateConversationAction) — no reason to eagerly carry 50 messages
    // for every one of them.
    mocks.conversation.findMany.mockResolvedValue([]);
    mockTotalUnread(1);

    await fetchInboxConversations(BUSINESS_ID);

    const [recentQueryArgs, unreadQueryArgs] = mocks.conversation.findMany.mock.calls.map(
      ([args]) => args
    );
    const recentMessageLimit = recentQueryArgs.select.messages.take;
    const unreadMessageLimit = unreadQueryArgs.select.messages.take;
    expect(unreadMessageLimit).toBeLessThan(recentMessageLimit);
  });

  it("skips the unread-merge query once the recent batch already accounts for the full unread total", async () => {
    // If the business-wide total can't be any higher than what `recent`
    // already sums to, no unread conversation can exist outside it — running
    // the merge query would just be a wasted round trip on every poll.
    const recent = [conversation("recent_1", 2, "2026-06-23T10:00:00.000Z")];
    mocks.conversation.findMany.mockResolvedValueOnce(recent);
    mockTotalUnread(2);

    const { conversations } = await fetchInboxConversations(BUSINESS_ID);

    expect(mocks.conversation.findMany).toHaveBeenCalledTimes(1);
    expect(conversations.map((item) => item.id)).toEqual(["recent_1"]);
  });

  it("returns the business-wide unread total from the aggregate alongside the conversations", async () => {
    mocks.conversation.findMany.mockResolvedValue([]);
    mockTotalUnread(7);

    const { totalUnreadCount } = await fetchInboxConversations(BUSINESS_ID);

    expect(totalUnreadCount).toBe(7);
  });
});
