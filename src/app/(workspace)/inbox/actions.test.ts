import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const conversation = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const client = { findFirst: vi.fn() };
  const getAuthedBusiness = vi.fn();
  return { conversation, client, getAuthedBusiness };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: mocks.conversation,
    client: mocks.client,
  },
}));

vi.mock("@/lib/business", () => ({
  getAuthedBusiness: mocks.getAuthedBusiness,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteConversationAction } from "./actions";

const BUSINESS = { id: "biz_1" };
const CONVERSATION_ID = "conv_1";
// phoneNumber is a required (non-nullable) field on the real Conversation
// model — phoneLookupKey (called unconditionally) would throw on null, so
// this must be a realistic value even though the linked-client lookup it
// drives is unrelated to the guard being tested here.
const CONVERSATION = { id: CONVERSATION_ID, phoneNumber: "+1 555 0100" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedBusiness.mockResolvedValue({ business: BUSINESS, user: {} });
  // No linked client by default — keeps the lookup this drives out of scope
  // for tests that aren't about it.
  mocks.client.findFirst.mockResolvedValue(null);
});

describe("deleteConversationAction", () => {
  it("deletes a conversation and revalidates", async () => {
    mocks.conversation.findFirst.mockResolvedValue(CONVERSATION);
    mocks.conversation.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteConversationAction(CONVERSATION_ID);

    expect(result).toEqual({ ok: true, conversationId: CONVERSATION_ID });
    expect(mocks.conversation.deleteMany).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID, businessId: "biz_1" },
    });
  });

  it("closes the race: a concurrent delete that already won makes this one a typed not-found, not an unhandled Prisma throw", async () => {
    // Same class as deleteAppointmentCore/deleteClientAction/deleteStaffAction:
    // findFirst existence check, then a guarded deleteMany instead of an
    // unguarded .delete() by id, so a losing concurrent delete (two admin
    // tabs, a double-click) reports count: 0 instead of Prisma throwing
    // P2025 "Record not found".
    mocks.conversation.findFirst.mockResolvedValue(CONVERSATION);
    mocks.conversation.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteConversationAction(CONVERSATION_ID);

    expect(result).toEqual({
      ok: false,
      error: "Conversation not found in this clinic workspace.",
    });
  });

  it("returns not-found when the conversation doesn't exist (or isn't in scope)", async () => {
    mocks.conversation.findFirst.mockResolvedValue(null);

    const result = await deleteConversationAction(CONVERSATION_ID);

    expect(result).toEqual({
      ok: false,
      error: "Conversation not found in this clinic workspace.",
    });
    expect(mocks.conversation.deleteMany).not.toHaveBeenCalled();
  });
});
