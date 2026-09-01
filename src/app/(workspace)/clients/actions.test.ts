import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  };
  const getAuthedBusiness = vi.fn();
  const deleteStorageReferences = vi.fn();
  const loggerError = vi.fn();
  return { client, getAuthedBusiness, deleteStorageReferences, loggerError };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: mocks.client,
  },
}));

vi.mock("@/lib/business", () => ({
  getAuthedBusiness: mocks.getAuthedBusiness,
}));

vi.mock("@/lib/media-storage-server", () => ({
  deleteStorageReferences: mocks.deleteStorageReferences,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteClientAction } from "./actions";

const BUSINESS = { id: "biz_1" };
const CLIENT_ID = "client_1";
const EXISTING = {
  galleryItems: [{ imageUrl: "gallery_1.png" }],
  documents: [{ storageUrl: "doc_1.pdf", fileUrl: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedBusiness.mockResolvedValue({ business: BUSINESS, user: {} });
});

describe("deleteClientAction", () => {
  it("deletes a client, cleans up its storage files, and revalidates", async () => {
    mocks.client.findFirst.mockResolvedValue(EXISTING);
    mocks.client.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteClientAction(CLIENT_ID);

    expect(result).toEqual({ ok: true, clientId: CLIENT_ID });
    expect(mocks.client.deleteMany).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, businessId: "biz_1" },
    });
    expect(mocks.deleteStorageReferences).toHaveBeenCalledWith(["gallery_1.png", "doc_1.pdf"]);
  });

  it("closes the race: a concurrent delete that already won makes this one a typed not-found — not an unhandled Prisma throw — and skips storage cleanup", async () => {
    // Two admin tabs (or a double-click) both pass the pre-read's existence
    // check; the first request's delete wins and removes the row before this
    // second request's guarded delete runs. Because the guard is the
    // deleteMany's own WHERE match (not `.delete` by id), this call reports
    // `count: 0` instead of Prisma throwing P2025 "Record not found" — and,
    // critically, the loser never attempts deleteStorageReferences, since the
    // winner already ran it for the same files.
    mocks.client.findFirst.mockResolvedValue(EXISTING);
    mocks.client.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteClientAction(CLIENT_ID);

    expect(result).toEqual({ ok: false, error: "Client not found in this clinic workspace." });
    expect(mocks.deleteStorageReferences).not.toHaveBeenCalled();
  });

  it("returns not-found when the client doesn't exist (or isn't in scope)", async () => {
    mocks.client.findFirst.mockResolvedValue(null);

    const result = await deleteClientAction(CLIENT_ID);

    expect(result).toEqual({ ok: false, error: "Client not found in this clinic workspace." });
    expect(mocks.client.deleteMany).not.toHaveBeenCalled();
    expect(mocks.deleteStorageReferences).not.toHaveBeenCalled();
  });

  it("still reports success when the delete succeeded but storage cleanup failed, and logs the failure", async () => {
    // The client record is already gone once deleteMany wins — a retry
    // through this same action would just see "not found" before ever
    // reaching cleanup again, so there's no path back to a failed cleanup.
    // Reporting failure here would be misleading: the delete the admin
    // asked for did happen. Log it instead so it's discoverable.
    mocks.client.findFirst.mockResolvedValue(EXISTING);
    mocks.client.deleteMany.mockResolvedValue({ count: 1 });
    mocks.deleteStorageReferences.mockRejectedValue(new Error("storage unavailable"));

    const result = await deleteClientAction(CLIENT_ID);

    expect(result).toEqual({ ok: true, clientId: CLIENT_ID });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Failed to clean up a deleted client's storage files.",
      expect.any(Error),
      { clientId: CLIENT_ID }
    );
  });
});
