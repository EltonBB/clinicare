import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPrismaSendKeyStore } from "./send-key-store";

const table = {
  createMany: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
};
const prisma = { whatsAppSendKey: table } as unknown as Parameters<typeof createPrismaSendKeyStore>[0];

const NOW = new Date("2026-10-04T12:00:00Z");
const EXPIRES = new Date("2026-10-11T12:00:00Z");
const RESERVE = { businessId: "biz_1", key: "follow-up:d1", fingerprint: "fp", expiresAt: EXPIRES, now: NOW };
const FRESH = { fingerprint: "fp", state: "SENDING", providerMessageId: null, expiresAt: EXPIRES };

beforeEach(() => {
  vi.clearAllMocks();
  table.createMany.mockResolvedValue({ count: 1 });
  table.updateMany.mockResolvedValue({ count: 0 });
  table.deleteMany.mockResolvedValue({ count: 0 });
});

describe("createPrismaSendKeyStore", () => {
  it("claims a new key by inserting a SENDING record, skipping one that exists", async () => {
    expect(await createPrismaSendKeyStore(prisma).reserve(RESERVE)).toBeNull();
    expect(table.createMany).toHaveBeenCalledWith({
      data: [{ businessId: "biz_1", key: "follow-up:d1", ...FRESH }],
      skipDuplicates: true,
    });
  });

  it("takes over an expired record in one guarded update", async () => {
    table.createMany.mockResolvedValue({ count: 0 });
    table.updateMany.mockResolvedValue({ count: 1 });

    expect(await createPrismaSendKeyStore(prisma).reserve(RESERVE)).toBeNull();
    expect(table.updateMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", key: "follow-up:d1", expiresAt: { lte: NOW } },
      data: FRESH,
    });
  });

  it("returns a live record instead of claiming it", async () => {
    table.createMany.mockResolvedValue({ count: 0 });
    table.findUnique.mockResolvedValue({ fingerprint: "fp", state: "SENT", providerMessageId: "BAE_1" });

    expect(await createPrismaSendKeyStore(prisma).reserve(RESERVE)).toEqual({
      fingerprint: "fp",
      state: "SENT",
      providerMessageId: "BAE_1",
    });
  });

  it("refuses (throws) when the record vanished between its reads, so nothing is sent unrecorded", async () => {
    table.createMany.mockResolvedValue({ count: 0 });
    table.findUnique.mockResolvedValue(null);

    await expect(createPrismaSendKeyStore(prisma).reserve(RESERVE)).rejects.toThrow();
  });

  it("settles and releases by the key's own record", async () => {
    const store = createPrismaSendKeyStore(prisma);
    await store.settle({ businessId: "biz_1", key: "k", state: "UNKNOWN", providerMessageId: null });
    await store.release({ businessId: "biz_1", key: "k" });

    expect(table.update).toHaveBeenCalledWith({
      where: { businessId_key: { businessId: "biz_1", key: "k" } },
      data: { state: "UNKNOWN", providerMessageId: null },
    });
    expect(table.deleteMany).toHaveBeenCalledWith({ where: { businessId: "biz_1", key: "k" } });
  });

  it("sweeps expired records at most once an hour", async () => {
    const store = createPrismaSendKeyStore(prisma);
    await store.reserve(RESERVE);
    await store.reserve({ ...RESERVE, now: new Date(NOW.getTime() + 60_000) });
    await store.reserve({ ...RESERVE, now: new Date(NOW.getTime() + 61 * 60_000) });

    const sweeps = table.deleteMany.mock.calls.filter(([args]) => "expiresAt" in args.where);
    expect(sweeps).toEqual([
      [{ where: { expiresAt: { lte: NOW } } }],
      [{ where: { expiresAt: { lte: new Date(NOW.getTime() + 61 * 60_000) } } }],
    ]);
  });
});
