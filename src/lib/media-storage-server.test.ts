import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const remove = vi.fn();
  const createSignedUrls = vi.fn();
  const from = vi.fn(() => ({ remove, createSignedUrls }));
  const createClient = vi.fn(async () => ({ storage: { from } }));
  const loggerError = vi.fn();
  const loggerWarn = vi.fn();
  const pendingStorageCleanup = {
    create: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  };
  // A second, separate client for the service-role (sweep) path — kept
  // distinct from `from`/`remove` above so a test can assert the sweep used
  // the service-role client specifically, never the cookie-backed one.
  const serviceRoleRemove = vi.fn();
  const serviceRoleFrom = vi.fn(() => ({ remove: serviceRoleRemove }));
  const createServiceRoleClient = vi.fn(() => ({ storage: { from: serviceRoleFrom } }));
  const getSupabaseServiceRoleKey = vi.fn();
  const getSupabaseUrl = vi.fn();
  return {
    remove,
    createSignedUrls,
    from,
    createClient,
    loggerError,
    loggerWarn,
    pendingStorageCleanup,
    serviceRoleRemove,
    serviceRoleFrom,
    createServiceRoleClient,
    getSupabaseServiceRoleKey,
    getSupabaseUrl,
  };
});

vi.mock("@/utils/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createServiceRoleClient,
}));

vi.mock("@/lib/env", () => ({
  getSupabaseServiceRoleKey: mocks.getSupabaseServiceRoleKey,
  getSupabaseUrl: mocks.getSupabaseUrl,
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
  sweepPendingStorageCleanup,
} from "./media-storage-server";
import { createStorageReference } from "./media-storage";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pendingStorageCleanup.deleteMany.mockResolvedValue({ count: 1 });
  mocks.pendingStorageCleanup.updateMany.mockResolvedValue({ count: 1 });
  mocks.pendingStorageCleanup.findMany.mockResolvedValue([]);
  mocks.getSupabaseServiceRoleKey.mockReturnValue("service-role-key");
  mocks.getSupabaseUrl.mockReturnValue("https://project.supabase.co");
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
      where: { id: "pending_1", attempts: 1 },
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

describe("sweepPendingStorageCleanup", () => {
  it("does nothing and reports serviceRoleConfigured: false when the service-role key isn't set", async () => {
    mocks.getSupabaseServiceRoleKey.mockReturnValue(null);

    const result = await sweepPendingStorageCleanup();

    expect(result).toEqual({
      serviceRoleConfigured: false,
      due: 0,
      cleaned: 0,
      invalidRowsDropped: 0,
      retryScheduled: 0,
      errored: 0,
    });
    expect(mocks.pendingStorageCleanup.findMany).not.toHaveBeenCalled();
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("builds the service-role client with a fetch timeout wrapper, not the raw platform fetch", async () => {
    // A regression guard for the timeout fix itself: without this, a
    // refactor could silently drop the AbortSignal.timeout wrapping and
    // reintroduce the exact silent-hang failure mode it exists to prevent —
    // nothing else in this suite would catch that, since it's otherwise only
    // exercised inside a real network call.
    await sweepPendingStorageCleanup();

    expect(mocks.createServiceRoleClient).toHaveBeenCalledWith(
      expect.any(String),
      "service-role-key",
      expect.objectContaining({
        global: expect.objectContaining({ fetch: expect.any(Function) }),
      })
    );
  });

  it("queries due rows oldest-first with a capped batch size", async () => {
    await sweepPendingStorageCleanup();

    expect(mocks.pendingStorageCleanup.findMany).toHaveBeenCalledWith({
      where: { nextAttemptAt: { lte: expect.any(Date) } },
      orderBy: { nextAttemptAt: "asc" },
      take: 50,
      select: {
        id: true,
        businessId: true,
        values: true,
        attempts: true,
        business: { select: { ownerId: true } },
      },
    });
  });

  it("cleans a row via the service-role client when every value belongs to the queuing business", async () => {
    mocks.pendingStorageCleanup.findMany.mockResolvedValue([
      {
        id: "pending_1",
        businessId: "biz_1",
        attempts: 0,
        values: [createStorageReference("clinic-media", "owner_1/client-documents/doc.pdf")],
        business: { ownerId: "owner_1" },
      },
    ]);
    mocks.serviceRoleRemove.mockResolvedValue({ error: null });

    const result = await sweepPendingStorageCleanup();

    // The service-role client, never the cookie-backed request-path one.
    expect(mocks.serviceRoleFrom).toHaveBeenCalledWith("clinic-media");
    expect(mocks.serviceRoleRemove).toHaveBeenCalledWith(["owner_1/client-documents/doc.pdf"]);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.pendingStorageCleanup.deleteMany).toHaveBeenCalledWith({ where: { id: "pending_1" } });
    expect(result).toMatchObject({ serviceRoleConfigured: true, due: 1, cleaned: 1 });
  });

  it("drops a row whose only value doesn't belong to the queuing business, without ever calling remove", async () => {
    mocks.pendingStorageCleanup.findMany.mockResolvedValue([
      {
        id: "pending_2",
        businessId: "biz_2",
        attempts: 0,
        values: [createStorageReference("clinic-media", "owner_other/client-documents/doc.pdf")],
        business: { ownerId: "owner_2" },
      },
    ]);

    const result = await sweepPendingStorageCleanup();

    expect(mocks.serviceRoleRemove).not.toHaveBeenCalled();
    expect(mocks.pendingStorageCleanup.deleteMany).toHaveBeenCalledWith({ where: { id: "pending_2" } });
    // Found-vs-expected prefix + bucket, never the full path — lets a human
    // tell a real cross-tenant hit apart from a data/logic bug.
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Storage cleanup sweep found queued value(s) that don't belong to the business that queued them — dropped without deleting.",
      undefined,
      {
        pendingStorageCleanupId: "pending_2",
        businessId: "biz_2",
        expectedOwnerId: "owner_2",
        found: "clinic-media:owner_other",
      }
    );
    expect(result).toMatchObject({ invalidRowsDropped: 1 });
  });

  it("removes only the valid subset of a mixed row, still logs the mismatched entry once, and clears the row", async () => {
    mocks.pendingStorageCleanup.findMany.mockResolvedValue([
      {
        id: "pending_3",
        businessId: "biz_3",
        attempts: 0,
        values: [
          createStorageReference("clinic-media", "owner_3/client-documents/legit.pdf"),
          createStorageReference("clinic-media", "owner_other/client-documents/mismatch.pdf"),
        ],
        business: { ownerId: "owner_3" },
      },
    ]);
    mocks.serviceRoleRemove.mockResolvedValue({ error: null });

    const result = await sweepPendingStorageCleanup();

    expect(mocks.serviceRoleRemove).toHaveBeenCalledWith(["owner_3/client-documents/legit.pdf"]);
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
    expect(mocks.pendingStorageCleanup.deleteMany).toHaveBeenCalledWith({ where: { id: "pending_3" } });
    expect(result).toMatchObject({ cleaned: 1 });
  });

  it("persists just the mismatch-narrowed value set when the valid subset still fails to remove", async () => {
    mocks.pendingStorageCleanup.findMany.mockResolvedValue([
      {
        id: "pending_4",
        businessId: "biz_4",
        attempts: 0,
        values: [
          createStorageReference("clinic-media", "owner_4/client-documents/legit.pdf"),
          createStorageReference("clinic-media", "owner_other/client-documents/mismatch.pdf"),
        ],
        business: { ownerId: "owner_4" },
      },
    ]);
    mocks.serviceRoleRemove.mockResolvedValue({ error: new Error("permission denied") });

    const result = await sweepPendingStorageCleanup();

    expect(mocks.pendingStorageCleanup.deleteMany).not.toHaveBeenCalled();
    expect(mocks.pendingStorageCleanup.updateMany).toHaveBeenCalledWith({
      where: { id: "pending_4", attempts: 0 },
      data: {
        attempts: { increment: 1 },
        lastError: expect.any(String),
        nextAttemptAt: expect.any(Date),
        // Narrowed to just the still-legitimate entry — the mismatched one
        // was already logged and must never be re-examined on retry.
        values: [createStorageReference("clinic-media", "owner_4/client-documents/legit.pdf")],
      },
    });
    expect(result).toMatchObject({ retryScheduled: 1 });
  });

  it("does not log a duplicate alert when a concurrent writer already advanced this row's attempts", async () => {
    // Simulates the race attemptStorageCleanup's post-commit attempt and
    // this sweep can now genuinely have on a freshly-created row (nextAttemptAt
    // defaults to now()): both read attempts=4 and both fail, but only the
    // first writer's compare-and-set (`where: { id, attempts: 4 }`) actually
    // matches — count comes back 0 for the loser.
    mocks.pendingStorageCleanup.findMany.mockResolvedValue([
      {
        id: "pending_race",
        businessId: "biz_race",
        attempts: 4,
        values: [createStorageReference("clinic-media", "owner_race/client-documents/doc.pdf")],
        business: { ownerId: "owner_race" },
      },
    ]);
    mocks.serviceRoleRemove.mockResolvedValue({ error: new Error("permission denied") });
    mocks.pendingStorageCleanup.updateMany.mockResolvedValue({ count: 0 });

    const result = await sweepPendingStorageCleanup();

    // The count:0 mock only proves this test's *point* if the code actually
    // sent the compare-and-set value it's supposed to — assert the `where`
    // clause directly, not just the pre-programmed return.
    expect(mocks.pendingStorageCleanup.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pending_race", attempts: 4 } })
    );
    // Would otherwise be the hourly->daily transition (attempts 4 -> 5) and
    // fire the one deliberate alert — must not, since this call lost the race.
    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
    expect(result).toMatchObject({ retryScheduled: 1 });
  });

  it("does not touch `values` in the retry write when nothing was narrowed", async () => {
    mocks.pendingStorageCleanup.findMany.mockResolvedValue([
      {
        id: "pending_5",
        businessId: "biz_5",
        attempts: 0,
        values: [createStorageReference("clinic-media", "owner_5/client-documents/legit.pdf")],
        business: { ownerId: "owner_5" },
      },
    ]);
    mocks.serviceRoleRemove.mockResolvedValue({ error: new Error("permission denied") });

    await sweepPendingStorageCleanup();

    const { data } = mocks.pendingStorageCleanup.updateMany.mock.calls[0][0];
    expect(data).not.toHaveProperty("values");
  });

  it("silently drops a non-storage-reference value (e.g. a legacy external URL), unlike a real ownership mismatch", async () => {
    mocks.pendingStorageCleanup.findMany.mockResolvedValue([
      {
        id: "pending_6",
        businessId: "biz_6",
        attempts: 0,
        values: ["https://example.com/legacy-external.pdf"],
        business: { ownerId: "owner_6" },
      },
    ]);

    const result = await sweepPendingStorageCleanup();

    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(mocks.serviceRoleRemove).not.toHaveBeenCalled();
    expect(mocks.pendingStorageCleanup.deleteMany).toHaveBeenCalledWith({ where: { id: "pending_6" } });
    expect(result).toMatchObject({ invalidRowsDropped: 1 });
  });

  it("treats a matching prefix with an unexpected extra path segment as mismatched, not valid", async () => {
    // Every real upload path is exactly 3 segments (media-storage-client.ts:
    // `${ownerId}/${folder}/${uuid}.${ext}`). A value whose first segment
    // matches but which carries extra segments doesn't get a pass on the
    // prefix check alone.
    mocks.pendingStorageCleanup.findMany.mockResolvedValue([
      {
        id: "pending_7",
        businessId: "biz_7",
        attempts: 0,
        values: [createStorageReference("clinic-media", "owner_7/client-documents/nested/doc.pdf")],
        business: { ownerId: "owner_7" },
      },
    ]);

    const result = await sweepPendingStorageCleanup();

    expect(mocks.serviceRoleRemove).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Storage cleanup sweep found queued value(s) that don't belong to the business that queued them — dropped without deleting.",
      undefined,
      expect.objectContaining({ found: "clinic-media:owner_7" })
    );
    expect(result).toMatchObject({ invalidRowsDropped: 1 });
  });

  it("isolates a per-row failure — one row throwing unexpectedly doesn't abort the rest of the sweep", async () => {
    mocks.pendingStorageCleanup.findMany.mockResolvedValue([
      {
        id: "pending_bad",
        businessId: "biz_bad",
        attempts: 0,
        values: [createStorageReference("clinic-media", "owner_bad/client-documents/doc.pdf")],
        business: { ownerId: "owner_bad" },
      },
      {
        id: "pending_ok",
        businessId: "biz_ok",
        attempts: 0,
        values: [createStorageReference("clinic-media", "owner_ok/client-documents/doc.pdf")],
        business: { ownerId: "owner_ok" },
      },
    ]);
    // The first row's deleteMany throws (e.g. a DB pool timeout); the second
    // row's own deleteMany call should still run and succeed independently.
    mocks.pendingStorageCleanup.deleteMany.mockRejectedValueOnce(new Error("pool timeout"));
    mocks.serviceRoleRemove.mockResolvedValue({ error: null });

    const result = await sweepPendingStorageCleanup();

    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Storage cleanup sweep failed unexpectedly for one row.",
      expect.any(Error),
      { pendingStorageCleanupId: "pending_bad", businessId: "biz_bad" }
    );
    expect(mocks.pendingStorageCleanup.deleteMany).toHaveBeenCalledWith({ where: { id: "pending_ok" } });
    expect(result).toMatchObject({ due: 2, errored: 1, cleaned: 1 });
  });
});
