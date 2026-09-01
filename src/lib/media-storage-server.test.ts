import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const remove = vi.fn();
  const createSignedUrls = vi.fn();
  const from = vi.fn(() => ({ remove, createSignedUrls }));
  const createClient = vi.fn(async () => ({ storage: { from } }));
  const loggerError = vi.fn();
  const loggerWarn = vi.fn();
  const pendingStorageCleanup = { create: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() };
  return {
    remove,
    createSignedUrls,
    from,
    createClient,
    loggerError,
    loggerWarn,
    pendingStorageCleanup,
  };
});

vi.mock("@/utils/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn, info: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { pendingStorageCleanup: mocks.pendingStorageCleanup },
}));

import {
  attemptStorageCleanup,
  deleteStorageReferences,
  recordPendingStorageCleanup,
  resolveMediaDisplayUrls,
} from "./media-storage-server";
import { createStorageReference } from "./media-storage";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pendingStorageCleanup.deleteMany.mockResolvedValue({ count: 1 });
  mocks.pendingStorageCleanup.updateMany.mockResolvedValue({ count: 1 });
});

describe("deleteStorageReferences", () => {
  it("removes references grouped by bucket and doesn't throw on success", async () => {
    mocks.remove.mockResolvedValue({ error: null });

    await expect(
      deleteStorageReferences([
        createStorageReference("clinic-media", "biz_1/client-documents/doc.pdf"),
        createStorageReference("clinic-media", "biz_1/client-gallery/photo.png"),
      ])
    ).resolves.toBeUndefined();

    expect(mocks.from).toHaveBeenCalledWith("clinic-media");
    expect(mocks.remove).toHaveBeenCalledWith([
      "biz_1/client-documents/doc.pdf",
      "biz_1/client-gallery/photo.png",
    ]);
  });

  it("throws when Storage reports a removal failure, and logs bucket+count only — never the path", async () => {
    // This is the exact gap Codex flagged: the old implementation caught
    // this via `console.error` and resolved anyway, so no caller could ever
    // detect that a delete didn't actually happen — the promise looked
    // identical to success either way.
    mocks.remove.mockResolvedValue({ error: new Error("permission denied") });

    await expect(
      deleteStorageReferences([createStorageReference("clinic-media", "biz_1/client-documents/doc.pdf")])
    ).rejects.toThrow("Failed to delete 1 media object(s) from storage.");

    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Failed to delete media objects.",
      expect.any(Error),
      { bucket: "clinic-media", count: 1 }
    );
  });

  it("is a no-op for values that aren't recognized storage references (e.g. arbitrary external URLs)", async () => {
    await deleteStorageReferences(["https://example.com/some-file.pdf", null, undefined]);

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("resolveMediaDisplayUrls", () => {
  it("signs values across multiple buckets and maps each back to its own signed URL", async () => {
    // Exercises the bucket+path join used as this function's internal Map
    // key (previously a literal NUL byte between the two — a pre-existing,
    // invisible landmine that made this file unreadable as a diff; fixed to
    // a plain space here). Two buckets so a same-named path in each bucket
    // can't collide if that join were ever wrong.
    mocks.createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `signed://${path}`, error: null })),
      error: null,
    }));

    const result = await resolveMediaDisplayUrls([
      createStorageReference("clinic-media", "biz_1/client-documents/doc.pdf"),
      createStorageReference("clinic-logos", "biz_1/client-documents/doc.pdf"),
      "https://example.com/external.pdf",
      null,
    ]);

    expect(result.get(createStorageReference("clinic-media", "biz_1/client-documents/doc.pdf"))).toBe(
      "signed://biz_1/client-documents/doc.pdf"
    );
    expect(
      result.get(createStorageReference("clinic-logos", "biz_1/client-documents/doc.pdf"))
    ).toBe("signed://biz_1/client-documents/doc.pdf");
    expect(result.get("https://example.com/external.pdf")).toBe("https://example.com/external.pdf");
    expect(mocks.from).toHaveBeenCalledWith("clinic-media");
    expect(mocks.from).toHaveBeenCalledWith("clinic-logos");
  });

  it("maps a value to an empty string when its bucket's signing call fails", async () => {
    mocks.createSignedUrls.mockResolvedValue({ data: null, error: new Error("network error") });

    const result = await resolveMediaDisplayUrls([
      createStorageReference("clinic-media", "biz_1/client-documents/doc.pdf"),
    ]);

    expect(result.get(createStorageReference("clinic-media", "biz_1/client-documents/doc.pdf"))).toBe(
      ""
    );
  });
});

describe("recordPendingStorageCleanup", () => {
  it("writes nothing and returns null when there are no real values", async () => {
    const create = vi.fn();
    const tx = { pendingStorageCleanup: { create } } as never;

    const result = await recordPendingStorageCleanup(tx, "biz_1", [null, undefined, ""]);

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("writes the filtered values inside the caller's own transaction and returns the row handle", async () => {
    const create = vi.fn().mockResolvedValue({ id: "pending_1", attempts: 0 });
    const tx = { pendingStorageCleanup: { create } } as never;

    const result = await recordPendingStorageCleanup(tx, "biz_1", ["doc.pdf", null, "photo.png"]);

    expect(create).toHaveBeenCalledWith({
      data: { businessId: "biz_1", values: ["doc.pdf", "photo.png"] },
      select: { id: true, attempts: true },
    });
    expect(result).toEqual({ id: "pending_1", attempts: 0, values: ["doc.pdf", "photo.png"] });
  });
});

describe("attemptStorageCleanup", () => {
  it("is a no-op when there's nothing pending", async () => {
    await attemptStorageCleanup(null);

    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("clears the row via a guarded deleteMany on success", async () => {
    mocks.remove.mockResolvedValue({ error: null });

    await attemptStorageCleanup({
      id: "pending_1",
      attempts: 0,
      values: [createStorageReference("clinic-media", "biz_1/client-documents/doc.pdf")],
    });

    expect(mocks.remove).toHaveBeenCalledWith(["biz_1/client-documents/doc.pdf"]);
    expect(mocks.pendingStorageCleanup.deleteMany).toHaveBeenCalledWith({
      where: { id: "pending_1" },
    });
    expect(mocks.pendingStorageCleanup.updateMany).not.toHaveBeenCalled();
  });

  it("reschedules roughly an hour out and logs at warn level (not error) while under the retry limit", async () => {
    // Attempts 1 through LIMIT-1 stay quiet (warn, no Sentry) — an early
    // hourly failure might still be transient, so it doesn't get its own
    // page. Only the exact transition to daily (tested below) does.
    mocks.remove.mockResolvedValue({ error: new Error("permission denied") });

    await attemptStorageCleanup({
      id: "pending_1",
      attempts: 1,
      values: [createStorageReference("clinic-media", "biz_1/client-documents/doc.pdf")],
    });

    expect(mocks.pendingStorageCleanup.deleteMany).not.toHaveBeenCalled();
    expect(mocks.pendingStorageCleanup.updateMany).toHaveBeenCalledWith({
      where: { id: "pending_1" },
      data: {
        attempts: { increment: 1 },
        lastError: expect.any(String),
        nextAttemptAt: expect.any(Date),
      },
    });
    // Roughly an hour out — a range, not an exact match, to avoid a flaky
    // time-based assertion.
    const { nextAttemptAt } = mocks.pendingStorageCleanup.updateMany.mock.calls[0][0].data;
    const deltaMs = nextAttemptAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(55 * 60 * 1000);
    expect(deltaMs).toBeLessThan(65 * 60 * 1000);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "Storage cleanup attempt failed; will retry within the hour.",
      { pendingStorageCleanupId: "pending_1", attempts: 2, lastError: expect.any(String) }
    );
    // No error-level (Sentry-forwarding) call at all for this attempt — a
    // second peer-caught instance of the same "unconditional error call
    // defeats the tiering" shape Codex flagged, one level up: the tiering
    // itself must not call logger.error outside the one deliberate branch.
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("fires exactly one alert-level log at the hourly-to-daily transition, and reschedules a day out", async () => {
    mocks.remove.mockResolvedValue({ error: new Error("permission denied") });

    // previousAttempts=4 -> attempts becomes 5, the configured hourly limit.
    await attemptStorageCleanup({
      id: "pending_1",
      attempts: 4,
      values: [createStorageReference("clinic-media", "biz_1/client-documents/doc.pdf")],
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Storage cleanup has failed repeatedly and is moving to a daily retry cadence — investigate.",
      expect.any(Error),
      { pendingStorageCleanupId: "pending_1", attempts: 5, buckets: "clinic-media (1)" }
    );
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    const { nextAttemptAt } = mocks.pendingStorageCleanup.updateMany.mock.calls[0][0].data;
    expect(nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it("downgrades to a warn-level log (never forwarded to Sentry) past the transition, without re-alerting", async () => {
    mocks.remove.mockResolvedValue({ error: new Error("permission denied") });

    // previousAttempts=5 -> attempts becomes 6, already past the transition.
    await attemptStorageCleanup({
      id: "pending_1",
      attempts: 5,
      values: [createStorageReference("clinic-media", "biz_1/client-documents/doc.pdf")],
    });

    // Zero error-level (Sentry-forwarding) calls past the transition — this
    // is the actual fix for the Codex P2: attemptStorageCleanup calls
    // removeStorageObjects directly, not deleteStorageReferences, so there's
    // no separate per-bucket error log underneath to undermine the warn-only
    // tiering here.
    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "Storage cleanup attempt failed; will retry tomorrow.",
      { pendingStorageCleanupId: "pending_1", attempts: 6, lastError: expect.any(String) }
    );
  });
});
