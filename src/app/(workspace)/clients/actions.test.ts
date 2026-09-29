import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  };
  const clientMedication = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientHealthItem = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientCareNote = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientTreatmentPlanItem = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientFollowUpReminder = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientPayment = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientDocument = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientGalleryItem = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const waitlistEntry = { findMany: vi.fn() };
  const $transaction = vi.fn();
  const getAuthedBusiness = vi.fn();
  const attemptStorageCleanup = vi.fn();
  const recordPendingStorageCleanup = vi.fn();
  const removeWaitlistEntry = vi.fn();
  const after = vi.fn();
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
    waitlistEntry,
    $transaction,
    getAuthedBusiness,
    attemptStorageCleanup,
    recordPendingStorageCleanup,
    removeWaitlistEntry,
    after,
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
    waitlistEntry: mocks.waitlistEntry,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/business", () => ({
  getAuthedBusiness: mocks.getAuthedBusiness,
}));

vi.mock("@/lib/slot-offers", () => ({
  removeWaitlistEntry: mocks.removeWaitlistEntry,
}));

// Unrelated to this file's subject (inbox thread syncing on save) — stubbed
// so saveClientAction's unconditional post-update sync doesn't need the
// conversation/message models mocked too.
vi.mock("@/lib/inbox-server", () => ({
  normalizeConversationsForBusiness: vi.fn(),
  ensureConversationForClient: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/media-storage-server", () => ({
  attemptStorageCleanup: mocks.attemptStorageCleanup,
  recordPendingStorageCleanup: mocks.recordPendingStorageCleanup,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));

// after() defers its callback until after the response — production code
// never awaits it. To assert on what it defers, capture the callback each
// action registered and run it explicitly, matching how Next.js eventually
// runs it for real.
async function flushAfter() {
  const calls = mocks.after.mock.calls;
  await Promise.all(calls.map(([callback]) => callback()));
}

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
  saveClientAction,
} from "./actions";
import type { SaveClientPayload } from "@/lib/clients";

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
  // No held waiting-list offer by default — the offer-settling test below
  // overrides this to a real row.
  mocks.waitlistEntry.findMany.mockResolvedValue([]);
  mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      client: mocks.client,
      clientDocument: mocks.clientDocument,
      clientGalleryItem: mocks.clientGalleryItem,
    })
  );
});

describe("deleteClientAction", () => {
  it("deletes a client, records a storage-cleanup outbox entry, defers the attempt, and revalidates", async () => {
    mocks.client.findFirst.mockResolvedValue(EXISTING);
    mocks.client.deleteMany.mockResolvedValue({ count: 1 });
    const pending = { id: "pending_1", attempts: 0, values: ["gallery_1.png", "doc_1.pdf"] };
    mocks.recordPendingStorageCleanup.mockResolvedValue(pending);

    const result = await deleteClientAction(CLIENT_ID);

    expect(result).toEqual({ ok: true, clientId: CLIENT_ID });
    expect(mocks.client.deleteMany).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, businessId: "biz_1" },
    });
    // Recorded inside the same transaction as the delete (the tx passed
    // through is whatever $transaction's callback received above), using a
    // fresh in-transaction re-read rather than the earlier existence check.
    expect(mocks.recordPendingStorageCleanup).toHaveBeenCalledWith(expect.anything(), "biz_1", [
      "gallery_1.png",
      "doc_1.pdf",
    ]);
    // The action itself must not wait on the Storage round-trip — only
    // after() should have been called before the action returned.
    expect(mocks.attemptStorageCleanup).not.toHaveBeenCalled();
    expect(mocks.after).toHaveBeenCalledTimes(1);

    // The actual Storage call happens only once that deferred callback runs —
    // attemptStorageCleanup's own contract (tested in
    // media-storage-server.test.ts) covers success/failure/retry-scheduling.
    await flushAfter();
    expect(mocks.attemptStorageCleanup).toHaveBeenCalledWith(pending);
  });

  it("closes the race: a concurrent delete that already won makes this one a typed not-found — not an unhandled Prisma throw — and never records a cleanup entry", async () => {
    // Two admin tabs (or a double-click) both pass the pre-read's existence
    // check; the first request's delete wins and removes the row before this
    // second request's guarded delete runs. Because the guard is the
    // deleteMany's own WHERE match (not `.delete` by id), this call reports
    // `count: 0` instead of Prisma throwing P2025 "Record not found" — and,
    // critically, the loser never records or attempts cleanup, since the
    // winner already owns it for the same files.
    mocks.client.findFirst.mockResolvedValue(EXISTING);
    mocks.client.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteClientAction(CLIENT_ID);

    expect(result).toEqual({ ok: false, error: "Client not found in this clinic workspace." });
    expect(mocks.recordPendingStorageCleanup).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.attemptStorageCleanup).not.toHaveBeenCalled();
  });

  it("returns not-found when the client doesn't exist (or isn't in scope)", async () => {
    // The existence check now happens via the same in-transaction read used
    // for the storage-cleanup values (closing the upload-vs-delete race), so
    // this no longer short-circuits before opening a transaction — deleteMany
    // is simply never reached within it.
    mocks.client.findFirst.mockResolvedValue(null);

    const result = await deleteClientAction(CLIENT_ID);

    expect(result).toEqual({ ok: false, error: "Client not found in this clinic workspace." });
    expect(mocks.client.deleteMany).not.toHaveBeenCalled();
    expect(mocks.recordPendingStorageCleanup).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.attemptStorageCleanup).not.toHaveBeenCalled();
  });

  // Codex #130: deleting a client cascades their WaitlistEntry away — and
  // with it, via that entry's own cascade, its live SLOT_OFFER draft —
  // without ever releasing the freed appointment for re-offer. The next
  // candidate would never be contacted, and the hourly expiry sweep can't
  // recover it either (there's no draft left for it to find).
  it("settles each waiting-list offer this client holds before the delete cascades it away", async () => {
    mocks.client.findFirst.mockResolvedValue(EXISTING);
    mocks.client.deleteMany.mockResolvedValue({ count: 1 });
    mocks.recordPendingStorageCleanup.mockResolvedValue({ id: "pending_1", attempts: 0, values: [] });
    mocks.waitlistEntry.findMany.mockResolvedValue([{ id: "wl_1" }, { id: "wl_2" }]);
    mocks.removeWaitlistEntry.mockResolvedValue({ ok: true });

    const result = await deleteClientAction(CLIENT_ID);

    expect(result).toEqual({ ok: true, clientId: CLIENT_ID });
    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", clientId: CLIENT_ID, status: "OFFERED" },
      select: { id: true },
    });
    // One settlement per held offer, run BEFORE the delete transaction opens
    // — removeWaitlistEntry runs its own transaction and can't be nested
    // inside the delete's.
    expect(mocks.removeWaitlistEntry).toHaveBeenCalledTimes(2);
    expect(mocks.removeWaitlistEntry).toHaveBeenCalledWith({ id: "wl_1", businessId: "biz_1" });
    expect(mocks.removeWaitlistEntry).toHaveBeenCalledWith({ id: "wl_2", businessId: "biz_1" });
    expect(mocks.removeWaitlistEntry.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.client.deleteMany.mock.invocationCallOrder[0]
    );
  });

  it("does not look for a held offer to settle when the client holds none", async () => {
    mocks.client.findFirst.mockResolvedValue(EXISTING);
    mocks.client.deleteMany.mockResolvedValue({ count: 1 });
    mocks.recordPendingStorageCleanup.mockResolvedValue({ id: "pending_1", attempts: 0, values: [] });

    await deleteClientAction(CLIENT_ID);

    expect(mocks.removeWaitlistEntry).not.toHaveBeenCalled();
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
  it("closes the race: a concurrent delete that already won makes this one a typed not-found, not an unhandled Prisma throw — and never records a cleanup entry", async () => {
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    mocks[model].findFirst.mockResolvedValue({ id: SUB_RECORD_ID, [urlField]: "file.pdf" });
    mocks[model].deleteMany.mockResolvedValue({ count: 0 });

    const result = await action(SUB_RECORD_PAYLOAD);

    expect(result).toEqual({ ok: false, error: SUB_RECORD_NOT_FOUND_ERROR });
    expect(mocks[model].deleteMany).toHaveBeenCalledWith({
      where: { id: SUB_RECORD_ID, clientId: CLIENT_ID, businessId: "biz_1" },
    });
    // The guard-miss return happens before recording anything, so a losing
    // request must never queue cleanup for files the winner (if any) already
    // owns.
    expect(mocks.recordPendingStorageCleanup).not.toHaveBeenCalled();
  });

  it("returns not-found when the record doesn't exist (or isn't in scope)", async () => {
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    mocks[model].findFirst.mockResolvedValue(null);

    const result = await action(SUB_RECORD_PAYLOAD);

    expect(result).toEqual({ ok: false, error: SUB_RECORD_NOT_FOUND_ERROR });
    expect(mocks[model].deleteMany).not.toHaveBeenCalled();
    expect(mocks.recordPendingStorageCleanup).not.toHaveBeenCalled();
  });
});

// Server actions take client-serialized arguments: an object id like
// `{ not: "" }` would reach the guarded deleteMany as a filter and delete
// every matching record in the workspace (or, on save, would make the update
// target every client).
describe("client actions refuse a non-string id before touching the database", () => {
  const CRAFTED_ID = { not: "" } as unknown as string;

  function expectNoDatabaseCall() {
    const models = [
      mocks.client,
      mocks.clientMedication,
      mocks.clientHealthItem,
      mocks.clientCareNote,
      mocks.clientTreatmentPlanItem,
      mocks.clientFollowUpReminder,
      mocks.clientPayment,
      mocks.clientDocument,
      mocks.clientGalleryItem,
    ];
    for (const fn of models.flatMap((model) => Object.values(model))) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(mocks.recordPendingStorageCleanup).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  }

  it("deleteClientAction", async () => {
    expect(await deleteClientAction(CRAFTED_ID)).toEqual({
      ok: false,
      error: "Client not found in this clinic workspace.",
    });
    expectNoDatabaseCall();
  });

  it("saveClientAction, with a crafted id in the payload", async () => {
    const payload: SaveClientPayload = {
      id: CRAFTED_ID,
      name: "Arta Krasniqi",
      email: "",
      phone: "+38344111222",
      status: "active",
      notes: "",
      preferredChannel: "",
      assignedStaff: "",
      tags: "",
    };

    expect(await saveClientAction(payload)).toEqual({
      ok: false,
      error: "Client not found in this clinic workspace.",
    });
    expectNoDatabaseCall();
  });

  it.each([
    ["medication", deleteClientMedicationAction],
    ["health item", deleteClientHealthItemAction],
    ["care note", deleteClientCareNoteAction],
    ["treatment plan item", deleteClientTreatmentPlanItemAction],
    ["follow-up reminder", deleteClientFollowUpReminderAction],
    ["payment", deleteClientPaymentAction],
    ["document", deleteClientDocumentAction],
    ["gallery item", deleteClientGalleryItemAction],
  ])("delete %s, with a crafted record id or client id", async (_name, action) => {
    expect(await action({ id: CRAFTED_ID, clientId: CLIENT_ID })).toEqual({
      ok: false,
      error: SUB_RECORD_NOT_FOUND_ERROR,
    });
    expect(await action({ id: SUB_RECORD_ID, clientId: CRAFTED_ID })).toEqual({
      ok: false,
      error: SUB_RECORD_NOT_FOUND_ERROR,
    });
    expectNoDatabaseCall();
  });
});

// Codex #130: ELIGIBLE_CLIENT_WHERE hides this client's waitlist entries from
// the active list/cap the moment they go inactive/archived, but their status
// never changes — so reactivating the client later would silently let those
// entries re-enter the panel and count again with no capacity check at that
// point. saveClientAction must retire them the moment the save makes the
// client ineligible, the same way deleteClientAction already retires a held
// offer before the delete cascades it away.
describe("saveClientAction retires stale waiting-list entries when a client becomes ineligible", () => {
  const BASE_PAYLOAD: SaveClientPayload = {
    id: CLIENT_ID,
    name: "Arta Krasniqi",
    email: "",
    phone: "+38344111222",
    status: "active",
    notes: "",
    preferredChannel: "",
    assignedStaff: "",
    tags: "",
  };

  beforeEach(() => {
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID, phone: "+38344111222" });
    mocks.client.update.mockResolvedValue({});
  });

  it("retires WAITING and OFFERED entries when the save marks the client inactive", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([{ id: "wl_1" }, { id: "wl_2" }]);
    mocks.removeWaitlistEntry.mockResolvedValue({ ok: true });

    // The action's own post-update steps (inbox sync, fetching the saved
    // record to return) aren't relevant to this fix and aren't fully mocked
    // here — only that this new retirement step ran, and ran with the right
    // scope, is asserted.
    await saveClientAction({ ...BASE_PAYLOAD, status: "inactive" });

    expect(mocks.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "INACTIVE", isArchived: false }),
      })
    );
    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", clientId: CLIENT_ID, status: { in: ["WAITING", "OFFERED"] } },
      select: { id: true },
    });
    expect(mocks.removeWaitlistEntry).toHaveBeenCalledTimes(2);
    expect(mocks.removeWaitlistEntry).toHaveBeenCalledWith({ id: "wl_1", businessId: "biz_1" });
    expect(mocks.removeWaitlistEntry).toHaveBeenCalledWith({ id: "wl_2", businessId: "biz_1" });
  });

  it("retires entries when the save archives the client too", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([{ id: "wl_3" }]);
    mocks.removeWaitlistEntry.mockResolvedValue({ ok: true });

    await saveClientAction({ ...BASE_PAYLOAD, status: "archived" });

    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", clientId: CLIENT_ID, status: { in: ["WAITING", "OFFERED"] } },
      select: { id: true },
    });
    expect(mocks.removeWaitlistEntry).toHaveBeenCalledWith({ id: "wl_3", businessId: "biz_1" });
  });

  it("never looks for stale entries when the save keeps the client eligible", async () => {
    await saveClientAction({ ...BASE_PAYLOAD, status: "active" });

    expect(mocks.waitlistEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.removeWaitlistEntry).not.toHaveBeenCalled();
  });
});
