import { proto } from "baileys";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPrismaSentMessageStore } from "./sent-message-store";

const table = {
  createMany: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
};
const prisma = { whatsAppSentMessage: table } as unknown as Parameters<typeof createPrismaSentMessageStore>[0];

const NOW = new Date("2026-10-05T19:00:00Z");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MESSAGE: proto.IMessage = { extendedTextMessage: { text: "Hi Ana, see you at 10:00." } };

function store(now = NOW) {
  return createPrismaSentMessageStore(prisma, { ttlMs: WEEK_MS, now: () => now });
}

beforeEach(() => {
  vi.clearAllMocks();
  table.createMany.mockResolvedValue({ count: 1 });
  table.deleteMany.mockResolvedValue({ count: 0 });
});

describe("createPrismaSentMessageStore", () => {
  it("keeps the encoded message for the TTL, never overwriting an earlier copy", async () => {
    await store().remember("biz_1", "BAE_1", MESSAGE);

    const { data, skipDuplicates } = table.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      businessId: "biz_1",
      messageId: "BAE_1",
      expiresAt: new Date(NOW.getTime() + WEEK_MS),
    });
    expect(proto.Message.decode(data[0].content).toJSON()).toEqual(proto.Message.fromObject(MESSAGE).toJSON());
  });

  it("hands back the message it kept, looked up by workspace and message id", async () => {
    await store().remember("biz_1", "BAE_1", MESSAGE);
    const content = table.createMany.mock.calls[0][0].data[0].content;
    table.findUnique.mockResolvedValue({ content });

    const found = await store().get("biz_1", "BAE_1");

    expect(table.findUnique).toHaveBeenCalledWith({
      where: { businessId_messageId: { businessId: "biz_1", messageId: "BAE_1" } },
      select: { content: true },
    });
    expect(found?.extendedTextMessage?.text).toBe("Hi Ana, see you at 10:00.");
  });

  it("has nothing for a message it never kept", async () => {
    table.findUnique.mockResolvedValue(null);
    expect(await store().get("biz_1", "BAE_X")).toBeUndefined();
  });

  it("sweeps expired copies at most once an hour", async () => {
    const s = store();
    await s.remember("biz_1", "BAE_1", MESSAGE);
    await s.remember("biz_1", "BAE_2", MESSAGE);

    expect(table.deleteMany).toHaveBeenCalledTimes(1);
    expect(table.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: NOW } } });
  });
});
