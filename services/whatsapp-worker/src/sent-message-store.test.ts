import { proto } from "baileys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPrismaSentMessageStore } from "./sent-message-store";

const table = {
  createMany: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
};
const prisma = { whatsAppSentMessage: table } as unknown as Parameters<typeof createPrismaSentMessageStore>[0];

const NOW = new Date("2026-10-05T19:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;
const MESSAGE: proto.IMessage = { extendedTextMessage: { text: "Hi Ana, see you at 10:00." } };

function store() {
  return createPrismaSentMessageStore(prisma, { ttlMs: WEEK_MS });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  table.createMany.mockResolvedValue({ count: 1 });
  table.findUnique.mockResolvedValue(null);
  table.deleteMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.useRealTimers();
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

  it("hands back a copy from the table, looked up by workspace and message id", async () => {
    await store().remember("biz_1", "BAE_1", MESSAGE);
    const content = table.createMany.mock.calls[0][0].data[0].content;
    table.findUnique.mockResolvedValue({ content, expiresAt: new Date(NOW.getTime() + WEEK_MS) });

    const found = await store().get("biz_1", "BAE_1");

    expect(table.findUnique).toHaveBeenCalledWith({
      where: { businessId_messageId: { businessId: "biz_1", messageId: "BAE_1" } },
      select: { content: true, expiresAt: true },
    });
    expect(found?.extendedTextMessage?.text).toBe("Hi Ana, see you at 10:00.");
  });

  // Codex #134: a resend request can arrive before the write has finished.
  it("answers from memory while the write is still running", async () => {
    table.createMany.mockReturnValue(new Promise(() => {}));
    const s = store();
    void s.remember("biz_1", "BAE_1", MESSAGE);

    expect((await s.get("biz_1", "BAE_1"))?.extendedTextMessage?.text).toBe("Hi Ana, see you at 10:00.");
    expect(await s.get("biz_2", "BAE_1")).toBeUndefined();
    expect(table.findUnique).toHaveBeenCalledTimes(1);
  });

  it("keeps only the newest 500 in memory; older ones come from the table", async () => {
    const s = store();
    for (let i = 0; i <= 500; i += 1) await s.remember("biz_1", `BAE_${i}`, MESSAGE);

    expect(await s.get("biz_1", "BAE_0")).toBeUndefined();
    expect(await s.get("biz_1", "BAE_1")).toBeDefined();
    expect(table.findUnique).toHaveBeenCalledTimes(1);
  });

  it("has nothing for a message it never kept", async () => {
    expect(await store().get("biz_1", "BAE_X")).toBeUndefined();
  });

  // Codex #134: the week is a hard limit on patient-facing text.
  it("never hands back an expired copy, from memory or the table", async () => {
    const s = store();
    await s.remember("biz_1", "BAE_1", MESSAGE);
    vi.setSystemTime(NOW.getTime() + WEEK_MS);
    expect(await s.get("biz_1", "BAE_1")).toBeUndefined();

    table.findUnique.mockResolvedValue({ content: new Uint8Array(), expiresAt: new Date(NOW.getTime() + WEEK_MS) });
    expect(await s.get("biz_1", "BAE_2")).toBeUndefined();
  });

  it("deletes expired copies every hour, even when nothing is sent", async () => {
    const s = store();
    await s.remember("biz_1", "BAE_1", MESSAGE);

    await vi.advanceTimersByTimeAsync(HOUR_MS);
    expect(table.deleteMany).toHaveBeenCalledTimes(1);
    expect(table.deleteMany).toHaveBeenLastCalledWith({
      where: { expiresAt: { lte: new Date(NOW.getTime() + HOUR_MS) } },
    });

    // A week on, the hourly sweep has dropped the copy from memory too: the
    // read falls through to the table instead of answering from memory.
    await vi.advanceTimersByTimeAsync(WEEK_MS);
    expect(table.deleteMany).toHaveBeenCalledTimes(1 + 7 * 24);
    await s.get("biz_1", "BAE_1");
    expect(table.findUnique).toHaveBeenCalledTimes(1);
  });
});
