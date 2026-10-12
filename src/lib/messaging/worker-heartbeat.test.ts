import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { whatsAppWorkerLease: { findUnique } } }));

import { isWhatsAppWorkerDown, WORKER_DOWN_AFTER_MS } from "./worker-heartbeat";

const NOW = new Date("2026-10-13T10:00:00Z");

beforeEach(() => {
  findUnique.mockReset();
});

describe("isWhatsAppWorkerDown", () => {
  it("is false while the lease is held, or lapsed only briefly (a redeploy handing over)", async () => {
    findUnique.mockResolvedValueOnce({ expiresAt: new Date(NOW.getTime() + 20_000) });
    expect(await isWhatsAppWorkerDown(NOW)).toBe(false);

    findUnique.mockResolvedValueOnce({ expiresAt: new Date(NOW.getTime() - WORKER_DOWN_AFTER_MS + 1_000) });
    expect(await isWhatsAppWorkerDown(NOW)).toBe(false);
  });

  it("is true once the lease has lapsed for longer than the grace, or was never taken", async () => {
    findUnique.mockResolvedValueOnce({ expiresAt: new Date(NOW.getTime() - WORKER_DOWN_AFTER_MS - 1_000) });
    expect(await isWhatsAppWorkerDown(NOW)).toBe(true);

    findUnique.mockResolvedValueOnce(null);
    expect(await isWhatsAppWorkerDown(NOW)).toBe(true);
  });
});
