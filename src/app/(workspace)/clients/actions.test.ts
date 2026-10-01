import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  };
  const clientMedication = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientHealthItem = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientCareNote = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientTreatmentPlanItem = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientFollowUpReminder = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientPayment = { findFirst: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn(), create: vi.fn(), update: vi.fn() };
  const clientDocument = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const clientGalleryItem = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const business = { findUniqueOrThrow: vi.fn() };
  const appointment = { groupBy: vi.fn(), count: vi.fn() };
  const waitlistEntry = { findMany: vi.fn() };
  const $transaction = vi.fn();
  const $executeRaw = vi.fn();
  const getAuthedBusiness = vi.fn();
  const attemptStorageCleanup = vi.fn();
  const recordPendingStorageCleanup = vi.fn();
  const resolveMediaDisplayUrls = vi.fn();
  const removeWaitlistEntry = vi.fn();
  const retireWaitlistEntries = vi.fn();
  const reofferFreedSlots = vi.fn();
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
    business,
    appointment,
    waitlistEntry,
    $transaction,
    $executeRaw,
    getAuthedBusiness,
    attemptStorageCleanup,
    recordPendingStorageCleanup,
    resolveMediaDisplayUrls,
    removeWaitlistEntry,
    retireWaitlistEntries,
    reofferFreedSlots,
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
    appointment: mocks.appointment,
    waitlistEntry: mocks.waitlistEntry,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/business", () => ({
  getAuthedBusiness: mocks.getAuthedBusiness,
}));

vi.mock("@/lib/slot-offers", () => ({
  removeWaitlistEntry: mocks.removeWaitlistEntry,
  retireWaitlistEntries: mocks.retireWaitlistEntries,
  reofferFreedSlots: mocks.reofferFreedSlots,
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
  resolveMediaDisplayUrls: mocks.resolveMediaDisplayUrls,
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
  addClientPaymentAction,
  updateClientPaymentAction,
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
import type { AddClientPaymentPayload, UpdateClientPaymentPayload } from "./actions";
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

// What fetchClientRecord reads back after a successful mutation — every
// relation the query selects, empty, plus the scalar Client fields
// buildClientRecord needs. CodeRabbit #130: without this, a test could pass
// on `{ ok: false }` and never notice (client.findFirstOrThrow was
// unmocked, so the action always failed silently).
const SAVED_CLIENT_RECORD = {
  id: CLIENT_ID,
  businessId: "biz_1",
  business: { currency: "EUR" },
  name: "Arta Krasniqi",
  email: null,
  phone: "+38344111222",
  phoneKey: "38344111222",
  gender: null,
  dateOfBirth: null,
  address: null,
  patientType: "New Patient",
  clinicType: null,
  notes: null,
  medicalHistory: null,
  allergies: null,
  importantHealthNotes: null,
  previousTreatments: null,
  treatmentPlan: null,
  status: "ACTIVE",
  preferredChannel: null,
  assignedStaffName: null,
  tags: [],
  isArchived: false,
  lastVisitAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  appointments: [],
  messages: [],
  galleryItems: [],
  medications: [],
  documents: [],
  payments: [],
  healthItems: [],
  careNotes: [],
  treatmentPlanItems: [],
  followUpReminders: [],
  _count: { appointments: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedBusiness.mockResolvedValue({ business: BUSINESS, user: {} });
  // No held waiting-list offer by default — the offer-settling test below
  // overrides this to a real row.
  mocks.waitlistEntry.findMany.mockResolvedValue([]);
  mocks.retireWaitlistEntries.mockResolvedValue([]);
  mocks.reofferFreedSlots.mockResolvedValue(undefined);
  mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      client: mocks.client,
      clientDocument: mocks.clientDocument,
      clientGalleryItem: mocks.clientGalleryItem,
      clientPayment: mocks.clientPayment,
      business: mocks.business,
      $executeRaw: mocks.$executeRaw,
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
  // recover it either (there's no draft left for it to find). The client's
  // entries are therefore retired in the SAME transaction as the delete: done
  // beforehand, a cancellation could hand a WAITING entry a new offer in the
  // gap and the delete would then cascade it away.
  describe("the client's waiting-list entries", () => {
    beforeEach(() => {
      mocks.client.findFirst.mockResolvedValue(EXISTING);
      mocks.client.deleteMany.mockResolvedValue({ count: 1 });
      mocks.recordPendingStorageCleanup.mockResolvedValue({ id: "pending_1", attempts: 0, values: [] });
    });

    it("are retired inside the delete transaction, the freed slots offered on only after the client is gone", async () => {
      mocks.retireWaitlistEntries.mockResolvedValue(["appt_1", null]);

      const result = await deleteClientAction(CLIENT_ID);

      expect(result).toEqual({ ok: true, clientId: CLIENT_ID });
      expect(mocks.$transaction).toHaveBeenCalledTimes(1);
      expect(mocks.retireWaitlistEntries).toHaveBeenCalledWith(expect.anything(), {
        businessId: "biz_1",
        clientId: CLIENT_ID,
      });
      expect(mocks.reofferFreedSlots).toHaveBeenCalledWith(expect.anything(), {
        businessId: "biz_1",
        appointmentIds: ["appt_1", null],
      });
      const [retire, remove, reoffer] = [
        mocks.retireWaitlistEntries,
        mocks.client.deleteMany,
        mocks.reofferFreedSlots,
      ].map((fn) => fn.mock.invocationCallOrder[0]);
      expect(retire).toBeLessThan(remove);
      expect(remove).toBeLessThan(reoffer);
    });

    it("are not touched, nor anything offered on, when the client doesn't exist", async () => {
      mocks.client.findFirst.mockResolvedValue(null);

      const result = await deleteClientAction(CLIENT_ID);

      expect(result.ok).toBe(false);
      expect(mocks.retireWaitlistEntries).not.toHaveBeenCalled();
      expect(mocks.reofferFreedSlots).not.toHaveBeenCalled();
    });

    it("offer nothing on when the delete lost the race to another request", async () => {
      mocks.retireWaitlistEntries.mockResolvedValue(["appt_1"]);
      mocks.client.deleteMany.mockResolvedValue({ count: 0 });

      const result = await deleteClientAction(CLIENT_ID);

      expect(result.ok).toBe(false);
      expect(mocks.reofferFreedSlots).not.toHaveBeenCalled();
      expect(mocks.recordPendingStorageCleanup).not.toHaveBeenCalled();
    });

    it("roll the whole deletion back when retiring them fails: the client stays, no cleanup is recorded", async () => {
      mocks.retireWaitlistEntries.mockRejectedValue(new Error("db down"));

      await expect(deleteClientAction(CLIENT_ID)).rejects.toThrow("db down");

      expect(mocks.client.deleteMany).not.toHaveBeenCalled();
      expect(mocks.recordPendingStorageCleanup).not.toHaveBeenCalled();
      expect(mocks.after).not.toHaveBeenCalled();
    });

    it("re-run the whole deletion once when Postgres aborts it as a deadlock", async () => {
      mocks.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("deadlock detected", { code: "P2034", clientVersion: "test" })
      );

      const result = await deleteClientAction(CLIENT_ID);

      expect(result).toEqual({ ok: true, clientId: CLIENT_ID });
      expect(mocks.$transaction).toHaveBeenCalledTimes(2);
      expect(mocks.client.deleteMany).toHaveBeenCalledTimes(1);
      expect(mocks.after).toHaveBeenCalledTimes(1);
    });
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

// Codex #130 / CodeRabbit #130: ELIGIBLE_CLIENT_WHERE hides an ineligible
// client's waitlist entries from the active list/cap, but their status never
// changes — so reactivating the client later would silently let them back in
// with no capacity check. saveClientAction retires them when the save makes the
// client ineligible, and does it in the SAME transaction as the status change:
// as two separate writes, a failure between them left a deactivated client with
// active entries (or retired entries for a client who stayed eligible).
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

  const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0];

  beforeEach(() => {
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID, phone: "+38344111222" });
    mocks.client.update.mockResolvedValue({});
    mocks.client.findFirstOrThrow.mockResolvedValue(SAVED_CLIENT_RECORD);
    mocks.appointment.groupBy.mockResolvedValue([]);
    mocks.appointment.count.mockResolvedValue(0);
    mocks.clientPayment.groupBy.mockResolvedValue([]);
    mocks.resolveMediaDisplayUrls.mockResolvedValue(new Map());
  });

  it("changes the status and retires the client's entries in ONE transaction — status first, then the freed slots are offered on", async () => {
    mocks.retireWaitlistEntries.mockResolvedValue(["appt_1", null]);

    const result = await saveClientAction({ ...BASE_PAYLOAD, status: "inactive" });

    expect(result.ok).toBe(true);
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLIENT_ID },
        data: expect.objectContaining({ status: "INACTIVE", isArchived: false }),
      })
    );
    expect(mocks.retireWaitlistEntries).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1",
      clientId: CLIENT_ID,
    });
    expect(mocks.reofferFreedSlots).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1",
      appointmentIds: ["appt_1", null],
    });
    // Status before retirement, so the re-offer can never hand a freed slot to
    // this very client's other entries; re-offer last, once both are written.
    expect(order(mocks.client.update)).toBeLessThan(order(mocks.retireWaitlistEntries));
    expect(order(mocks.retireWaitlistEntries)).toBeLessThan(order(mocks.reofferFreedSlots));
  });

  it("does the same when the save archives the client", async () => {
    mocks.retireWaitlistEntries.mockResolvedValue(["appt_2"]);

    const result = await saveClientAction({ ...BASE_PAYLOAD, status: "archived" });

    expect(result.ok).toBe(true);
    expect(mocks.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ARCHIVED", isArchived: true }) })
    );
    expect(mocks.retireWaitlistEntries).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1",
      clientId: CLIENT_ID,
    });
    expect(mocks.reofferFreedSlots).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1",
      appointmentIds: ["appt_2"],
    });
  });

  it("reports the failure — and rolls the transaction back — when retiring an entry throws", async () => {
    mocks.retireWaitlistEntries.mockRejectedValue(new Error("db down"));

    const result = await saveClientAction({ ...BASE_PAYLOAD, status: "inactive" });

    expect(result.ok).toBe(false);
    // The transaction callback threw, so Postgres rolls the status change back
    // with it; nothing is offered on.
    await expect(mocks.$transaction.mock.results[0].value).rejects.toThrow("db down");
    expect(mocks.reofferFreedSlots).not.toHaveBeenCalled();
  });

  it("re-runs the whole status change and retirement once when Postgres aborts it as a deadlock", async () => {
    mocks.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock detected", { code: "P2034", clientVersion: "test" })
    );

    const result = await saveClientAction({ ...BASE_PAYLOAD, status: "inactive" });

    expect(result.ok).toBe(true);
    expect(mocks.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.client.update).toHaveBeenCalledTimes(1);
  });

  it("opens no transaction and touches no entries for a save that keeps the client eligible", async () => {
    const result = await saveClientAction({ ...BASE_PAYLOAD, status: "active" });

    expect(result.ok).toBe(true);
    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(mocks.client.update).toHaveBeenCalledTimes(1);
    expect(mocks.retireWaitlistEntries).not.toHaveBeenCalled();
    expect(mocks.reofferFreedSlots).not.toHaveBeenCalled();
  });
});

// Codex #131: a concurrent settings save could read "no payments yet" and
// change the currency in the gap between this create's own read and write —
// the new payment would then be immediately mislabeled by the new currency.
describe("addClientPaymentAction acquires the financial lock before recording a payment", () => {
  const VALID_PAYLOAD: AddClientPaymentPayload = {
    clientId: CLIENT_ID,
    amount: "45.00",
    status: "Paid",
    description: "Cleaning",
    receiptUrl: "",
    paidAt: "2026-06-01",
  };

  beforeEach(() => {
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    mocks.client.findFirstOrThrow.mockResolvedValue(SAVED_CLIENT_RECORD);
    mocks.clientPayment.create.mockResolvedValue({});
    mocks.business.findUniqueOrThrow.mockResolvedValue({ currency: "EUR" });
  });

  it("acquires the lock, then creates the payment, inside one transaction", async () => {
    const result = await addClientPaymentAction(VALID_PAYLOAD);

    expect(result.ok).toBe(true);
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.clientPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessId: "biz_1", clientId: CLIENT_ID, amountCents: 4500 }),
      })
    );
    expect(mocks.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clientPayment.create.mock.invocationCallOrder[0]
    );
    // The amount is parsed against the currency read AFTER the lock, not
    // before it.
    expect(mocks.business.findUniqueOrThrow.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.$executeRaw.mock.invocationCallOrder[0]
    );
  });

  it("never creates the payment for an amount invalid against the freshly-read currency", async () => {
    const result = await addClientPaymentAction({ ...VALID_PAYLOAD, amount: "not a number" });

    expect(result.ok).toBe(false);
    expect(mocks.clientPayment.create).not.toHaveBeenCalled();
  });

  // Codex #131: a concurrent settings save could change the currency between
  // requireOwnedClient's own read (a stale snapshot the instant this request
  // started) and this action acquiring the lock. "€85" must be parsed
  // against whatever the currency actually is once the lock is held, not
  // the value read before it.
  it("parses the amount against the currency read fresh under the lock, not the stale value read before it", async () => {
    // requireOwnedClient's own read (via getAuthedBusiness) saw EUR — a
    // stale snapshot from before the lock. The fresh read under the lock
    // says the workspace is now USD.
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", currency: "EUR" }, user: {} });
    mocks.business.findUniqueOrThrow.mockResolvedValue({ currency: "USD" });

    const result = await addClientPaymentAction({ ...VALID_PAYLOAD, amount: "€45.00" });

    // A euro marker is rejected once the fresh, in-lock read says USD — the
    // old (stale-EUR-based) behavior would have accepted this.
    expect(result.ok).toBe(false);
    expect(mocks.clientPayment.create).not.toHaveBeenCalled();
  });
});

// Codex #130: an edit re-enters a payment's amount under the currency now in
// force, exactly like recording one. It therefore takes the same financial lock
// a currency change takes, and parses against the currency read under it — a
// correction that commits in between would otherwise leave "45.00" typed under
// one currency and stored under another. (The row write also bumps `updatedAt`,
// which is what makes an edited legacy payment count toward the currency lock;
// that rule is tested with saveSettingsAction.)
describe("updateClientPaymentAction takes the financial lock before editing a payment", () => {
  const PAYMENT_ID = "payment_1";
  const VALID_EDIT: UpdateClientPaymentPayload = {
    id: PAYMENT_ID,
    clientId: CLIENT_ID,
    amount: "45.00",
    status: "Paid",
    description: "Cleaning",
    receiptUrl: "",
    paidAt: "2026-06-01",
  };

  beforeEach(() => {
    mocks.client.findFirst.mockResolvedValue({ id: CLIENT_ID });
    mocks.clientPayment.findFirst.mockResolvedValue({ id: PAYMENT_ID });
    mocks.client.findFirstOrThrow.mockResolvedValue(SAVED_CLIENT_RECORD);
    mocks.clientPayment.update.mockResolvedValue({});
    mocks.business.findUniqueOrThrow.mockResolvedValue({ currency: "EUR" });
  });

  it("acquires the lock, reads the currency under it, then updates the payment, inside one transaction", async () => {
    const result = await updateClientPaymentAction(VALID_EDIT);

    expect(result.ok).toBe(true);
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.clientPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PAYMENT_ID },
        data: expect.objectContaining({ amountCents: 4500, status: "Paid" }),
      })
    );
    const [lock, currencyRead, write] = [
      mocks.$executeRaw,
      mocks.business.findUniqueOrThrow,
      mocks.clientPayment.update,
    ].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(lock).toBeLessThan(currencyRead);
    expect(currencyRead).toBeLessThan(write);
  });

  it("never updates the payment for an amount that isn't valid", async () => {
    const result = await updateClientPaymentAction({ ...VALID_EDIT, amount: "not a number" });

    expect(result).toEqual({ ok: false, error: "Enter a valid payment amount." });
    expect(mocks.clientPayment.update).not.toHaveBeenCalled();
  });

  it("parses the amount against the currency read fresh under the lock, not the stale value read before it", async () => {
    // The request started when the workspace read EUR; by the time the lock is
    // held, a currency correction has made it USD.
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", currency: "EUR" }, user: {} });
    mocks.business.findUniqueOrThrow.mockResolvedValue({ currency: "USD" });

    const result = await updateClientPaymentAction({ ...VALID_EDIT, amount: "€45.00" });

    expect(result.ok).toBe(false);
    expect(mocks.clientPayment.update).not.toHaveBeenCalled();
  });

  it("refuses an unsafe receipt link before opening a transaction", async () => {
    const result = await updateClientPaymentAction({ ...VALID_EDIT, receiptUrl: "javascript:alert(1)" });

    expect(result).toEqual({ ok: false, error: "Use a safe HTTPS receipt link." });
    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(mocks.clientPayment.update).not.toHaveBeenCalled();
  });

  it("takes no lock and writes nothing for a payment that isn't this client's", async () => {
    mocks.clientPayment.findFirst.mockResolvedValue(null);

    const result = await updateClientPaymentAction(VALID_EDIT);

    expect(result.ok).toBe(false);
    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(mocks.clientPayment.update).not.toHaveBeenCalled();
  });
});
