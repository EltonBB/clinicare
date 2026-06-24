import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const message = { findFirst: vi.fn(), create: vi.fn() };
  const client = { findFirst: vi.fn() };
  const conversation = { upsert: vi.fn() };
  const $transaction = vi.fn();
  return { message, client, conversation, $transaction };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: mocks.message,
    client: mocks.client,
    $transaction: mocks.$transaction,
  },
}));

import { recordInboundMessage } from "./inbound";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) =>
      cb({ conversation: mocks.conversation, message: mocks.message })
  );
});

describe("recordInboundMessage", () => {
  it("ignores an empty body without touching the database", async () => {
    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "+38344123456",
      body: "   ",
      providerMessageId: "M1",
    });
    expect(result).toEqual({ recorded: false, reason: "empty_body" });
    expect(mocks.message.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a recipient with too few digits", async () => {
    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "12",
      body: "hello",
      providerMessageId: "M1",
    });
    expect(result).toEqual({ recorded: false, reason: "invalid_phone" });
    expect(mocks.message.findFirst).not.toHaveBeenCalled();
  });

  it("skips a duplicate provider message id idempotently", async () => {
    mocks.message.findFirst.mockResolvedValue({ id: "existing" });
    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "+38344123456",
      body: "hello",
      providerMessageId: "M1",
    });
    expect(result).toEqual({ recorded: false, reason: "duplicate" });
    expect(mocks.client.findFirst).not.toHaveBeenCalled();
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it("threads onto the phoneKey conversation and links the matching client", async () => {
    mocks.message.findFirst.mockResolvedValue(null);
    mocks.client.findFirst.mockResolvedValue({ id: "client_9", name: "Mira" });
    mocks.conversation.upsert.mockResolvedValue({ id: "conv_1" });
    mocks.message.create.mockResolvedValue({ id: "msg_1" });

    const result = await recordInboundMessage({
      businessId: "biz_1",
      fromPhone: "+383 44 123 456",
      body: "  See you then  ",
      providerMessageId: "M2",
    });

    expect(result).toEqual({ recorded: true, conversationId: "conv_1" });

    expect(mocks.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId_phoneKey: { businessId: "biz_1", phoneKey: "38344123456" },
        },
      })
    );
    expect(mocks.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: "conv_1",
          clientId: "client_9",
          direction: "INBOUND",
          body: "See you then",
          providerMessageSid: "M2",
        }),
      })
    );
  });
});
