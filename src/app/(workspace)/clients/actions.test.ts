import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  };
  const clientMedication = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientHealthItem = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientCareNote = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientTreatmentPlanItem = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientFollowUpReminder = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientPayment = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientDocument = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientGalleryItem = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const getAuthedBusiness = vi.fn();
  const deleteStorageReferences = vi.fn();
  const loggerError = vi.fn();
  return {
    client,
    clientMedication,
    clientHealthItem,
    clientCareNote,
    clientTreatmentPlanItem,
    clientFollowUpReminder,
    clientPayment,
    clientDocument,
    clientGalleryItem,
    getAuthedBusiness,
    deleteStorageReferences,
    loggerError,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: mocks.client,
    clientMedication: mocks.clientMedication,
    clientHealthItem: mocks.clientHealthItem,
    clientCareNote: mocks.clientCareNote,
    clientTreatmentPlanItem: mocks.clientTreatmentPlanItem,
    clientFollowUpReminder: mocks.clientFollowUpReminder,
    clientPayment: mocks.clientPayment,
    clientDocument: mocks.clientDocument,
    clientGalleryItem: mocks.clientGalleryItem,
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

import {
  deleteClientAction,
  deleteClientCareNoteAction,
  deleteClientHealthItemAction,
  deleteClientMedicationAction,
  deleteClientFollowUpReminderAction,
  deleteClientPaymentAction,
  deleteClientTreatmentPlanItemAction,
  deleteClientDocumentAction,
  deleteClientGalleryItemAction,
} from "./actions";

const BUSINESS = { id: "biz_1" };
const CLIENT_ID = "client_1";
const SUB_RECORD_ID = "record_1";
const SUB_RECORD_PAYLOAD = { id: SUB_RECORD_ID, clientId: CLIENT_ID };
const SUB_RECORD_NOT_FOUND_ERROR = "This record was not found in the patient file.";
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
    // Client ID only, never the storage paths themselves: documents/gallery
    // items accept arbitrary external URLs (hasUnsafePublicUrl), which can
    // carry a patient name or clinical filename — unsafe for logs/Sentry.
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "Failed to clean up a deleted client's storage files.",
      expect.any(Error),
      { clientId: CLIENT_ID }
    );
  });
});

// These three share one shape (requireOwnedSubRecord's existence check, then
// a guarded delete, then respondWithClientRecord on success). Only the
// failure paths are tested here — success also calls respondWithClientRecord,
// whose fetchClientRecord issues a large multi-relation Prisma query that
// would need a disproportionate mock just to verify a delete guard; that
// path is unchanged by this fix and stays covered by tsc/lint/the full suite.
describe.each([
  {
    name: "deleteClientMedicationAction",
    action: deleteClientMedicationAction,
    model: "clientMedication" as const,
  },
  {
    name: "deleteClientHealthItemAction",
    action: deleteClientHealthItemAction,
    model: "clientHealthItem" as const,
  },
  {
    name: "deleteClientCareNoteAction",
    action: deleteClientCareNoteAction,
    model: "clientCareNote" as const,
  },
])("$name", ({ action, model }) => {
  it("closes the race: a concurrent delete that already won makes this one a typed not-found, not an unhandled Prisma throw", async () => {
    // requireOwnedSubRecord's own existence check (a separate, earlier read)
    // must see the record as present, or this test would exercise THAT
    // check's not-found branch instead of the new guarded delete below it.
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    mocks[model].findFirst.mockResolvedValue({ id: SUB_RECORD_ID });
    mocks[model].deleteMany.mockResolvedValue({ count: 0 });

    const result = await action(SUB_RECORD_PAYLOAD);

    expect(result).toEqual({ ok: false, error: SUB_RECORD_NOT_FOUND_ERROR });
    expect(mocks[model].deleteMany).toHaveBeenCalledWith({
      where: { id: SUB_RECORD_ID, clientId: CLIENT_ID, businessId: "biz_1" },
    });
  });

  it("returns not-found when the record doesn't exist (or isn't in scope)", async () => {
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    mocks[model].findFirst.mockResolvedValue(null);

    const result = await action(SUB_RECORD_PAYLOAD);

    expect(result).toEqual({ ok: false, error: SUB_RECORD_NOT_FOUND_ERROR });
    expect(mocks[model].deleteMany).not.toHaveBeenCalled();
  });
});

// Same shape and same tradeoff as the medication/health-item/care-note batch:
// only the failure paths are tested — success also calls
// respondWithClientRecord, whose fetchClientRecord issues a large
// multi-relation Prisma query that would need a disproportionate mock just
// to verify a delete guard.
describe.each([
  {
    name: "deleteClientTreatmentPlanItemAction",
    action: deleteClientTreatmentPlanItemAction,
    model: "clientTreatmentPlanItem" as const,
  },
  {
    name: "deleteClientFollowUpReminderAction",
    action: deleteClientFollowUpReminderAction,
    model: "clientFollowUpReminder" as const,
  },
  {
    name: "deleteClientPaymentAction",
    action: deleteClientPaymentAction,
    model: "clientPayment" as const,
  },
])("$name", ({ action, model }) => {
  it("closes the race: a concurrent delete that already won makes this one a typed not-found, not an unhandled Prisma throw", async () => {
    // requireOwnedSubRecord's own existence check (a separate, earlier read)
    // must see the record as present, or this test would exercise THAT
    // check's not-found branch instead of the new guarded delete below it.
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    mocks[model].findFirst.mockResolvedValue({ id: SUB_RECORD_ID });
    mocks[model].deleteMany.mockResolvedValue({ count: 0 });

    const result = await action(SUB_RECORD_PAYLOAD);

    expect(result).toEqual({ ok: false, error: SUB_RECORD_NOT_FOUND_ERROR });
    expect(mocks[model].deleteMany).toHaveBeenCalledWith({
      where: { id: SUB_RECORD_ID, clientId: CLIENT_ID, businessId: "biz_1" },
    });
  });

  it("returns not-found when the record doesn't exist (or isn't in scope)", async () => {
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    mocks[model].findFirst.mockResolvedValue(null);

    const result = await action(SUB_RECORD_PAYLOAD);

    expect(result).toEqual({ ok: false, error: SUB_RECORD_NOT_FOUND_ERROR });
    expect(mocks[model].deleteMany).not.toHaveBeenCalled();
  });
});

// deleteClientDocumentAction/deleteClientGalleryItemAction use
// requireOwnedClient + their own inline findFirst directly, not
// requireOwnedSubRecord — a pre-existing structural difference from the
// other sub-record actions, not something this fix changes. Same testing
// boundary as the other batches: only the failure paths (which return
// before ever reaching respondWithClientRecord) are covered here.
describe.each([
  {
    name: "deleteClientDocumentAction",
    action: deleteClientDocumentAction,
    model: "clientDocument" as const,
    urlField: "storageUrl",
  },
  {
    name: "deleteClientGalleryItemAction",
    action: deleteClientGalleryItemAction,
    model: "clientGalleryItem" as const,
    urlField: "imageUrl",
  },
])("$name", ({ action, model, urlField }) => {
  it("closes the race: a concurrent delete that already won makes this one a typed not-found, not an unhandled Prisma throw — and skips storage cleanup", async () => {
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    mocks[model].findFirst.mockResolvedValue({ id: SUB_RECORD_ID, [urlField]: "file.pdf" });
    mocks[model].deleteMany.mockResolvedValue({ count: 0 });

    const result = await action(SUB_RECORD_PAYLOAD);

    expect(result).toEqual({ ok: false, error: SUB_RECORD_NOT_FOUND_ERROR });
    expect(mocks[model].deleteMany).toHaveBeenCalledWith({
      where: { id: SUB_RECORD_ID, clientId: CLIENT_ID, businessId: "biz_1" },
    });
    // The guard-miss return happens before the storage-cleanup block, so a
    // losing request must never attempt to delete files the winner (if any)
    // is responsible for.
    expect(mocks.deleteStorageReferences).not.toHaveBeenCalled();
  });

  it("returns not-found when the record doesn't exist (or isn't in scope)", async () => {
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    mocks[model].findFirst.mockResolvedValue(null);

    const result = await action(SUB_RECORD_PAYLOAD);

    expect(result).toEqual({ ok: false, error: SUB_RECORD_NOT_FOUND_ERROR });
    expect(mocks[model].deleteMany).not.toHaveBeenCalled();
    expect(mocks.deleteStorageReferences).not.toHaveBeenCalled();
  });
});
