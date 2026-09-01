import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const remove = vi.fn();
  const from = vi.fn(() => ({ remove }));
  const createClient = vi.fn(async () => ({ storage: { from } }));
  const loggerError = vi.fn();
  return { remove, from, createClient, loggerError };
});

vi.mock("@/utils/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { deleteStorageReferences } from "./media-storage-server";
import { createStorageReference } from "./media-storage";

beforeEach(() => {
  vi.clearAllMocks();
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
