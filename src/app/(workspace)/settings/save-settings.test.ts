import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    business: { update: vi.fn(), findUniqueOrThrow: vi.fn() },
    businessHours: { upsert: vi.fn() },
    reminderSettings: { upsert: vi.fn() },
    clientPayment: { count: vi.fn() },
    $executeRaw: vi.fn(),
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(),
      business: { findUniqueOrThrow: vi.fn() },
    },
    getCurrentUser: vi.fn(),
    updateCurrentUserMetadata: vi.fn(),
    requireCurrentBusiness: vi.fn(),
    revalidatePath: vi.fn(),
    loadSettingsState: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  updateCurrentUserMetadata: mocks.updateCurrentUserMetadata,
}));
vi.mock("@/lib/business", () => ({
  requireCurrentBusiness: mocks.requireCurrentBusiness,
  requireCurrentWorkspace: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/settings-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings-server")>("@/lib/settings-server");
  return { ...actual, loadSettingsState: mocks.loadSettingsState };
});
vi.mock("@/lib/whatsapp-connection", () => ({ syncWhatsAppConnectionForBusiness: vi.fn() }));
vi.mock("@/lib/messaging/baileys-control", () => ({
  fetchBaileysStatus: vi.fn(),
  isBaileysWorkerConfigured: vi.fn(),
  requestBaileysPairing: vi.fn(),
}));
vi.mock("@/lib/media-storage-server", () => ({
  attemptStorageCleanup: vi.fn(),
  resolveMediaDisplayUrl: vi.fn(),
  OWNER_ID_SHAPE: /.*/,
  recordPendingStorageCleanup: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { CURRENCY_CHOOSABLE_FROM } from "@/lib/currency";
import type { SaveSettingsPayload } from "@/lib/settings";

import { saveSettingsAction } from "./actions";

const day = { enabled: true, start: "09:00", end: "17:00" };

function payload(currency?: string): SaveSettingsPayload {
  return {
    business: {
      businessName: "Vela Dent",
      businessType: "Clinic",
      currency,
      ownerName: "Owner",
      logoUrl: "",
    },
    appearance: { accentColor: "vela", accentHex: "#3142D8" },
    workingHours: {
      monday: day,
      tuesday: day,
      wednesday: day,
      thursday: day,
      friday: day,
      saturday: { ...day, enabled: false },
      sunday: { ...day, enabled: false },
    },
    whatsapp: { phoneNumber: "", sendReminders: false, reminderWindow: "" },
    reminders: {
      twentyFourHour: true,
      twoHour: true,
      firstReminderHours: 24,
      secondReminderHours: 2,
      template: "Hi {client_name}",
    },
  } as unknown as SaveSettingsPayload;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "user_1", user_metadata: {} });
  mocks.requireCurrentBusiness.mockResolvedValue({
    id: "biz_1",
    name: "Vela Dent",
    logoUrl: null,
    plan: "PRO",
    currency: "EUR",
  });
  mocks.prisma.$transaction.mockImplementation(async (run: (tx: typeof mocks.tx) => unknown) => run(mocks.tx));
  mocks.prisma.business.findUniqueOrThrow.mockResolvedValue({ id: "biz_1" });
  // The fresh in-transaction currency read defaults to matching the
  // pre-transaction snapshot (EUR) — tests that exercise a genuine
  // concurrent-change race override this.
  mocks.tx.business.findUniqueOrThrow.mockResolvedValue({ currency: "EUR" });
  // No payments on record by default — the guard test below overrides this.
  mocks.tx.clientPayment.count.mockResolvedValue(0);
  mocks.tx.$executeRaw.mockResolvedValue(undefined);
  mocks.updateCurrentUserMetadata.mockResolvedValue({ error: null });
  mocks.loadSettingsState.mockResolvedValue({ loaded: true });
});

describe("saveSettingsAction — currency", () => {
  it("saves the chosen currency on the business and revalidates every page that shows amounts", async () => {
    const result = await saveSettingsAction(payload("USD"));

    expect(result.ok).toBe(true);
    expect(mocks.tx.business.update).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: expect.objectContaining({ currency: "USD" }),
    });
    // Amounts render on the dashboard, client pages and more — the whole layout.
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it.each(["EUR", "GBP", "ALL", "CHF"])("accepts %s", async (code) => {
    expect((await saveSettingsAction(payload(code))).ok).toBe(true);
    expect(mocks.tx.business.update.mock.calls.at(-1)?.[0].data.currency).toBe(code);
  });

  it("leaves the stored currency alone when an older page omits the field", async () => {
    const result = await saveSettingsAction(payload(undefined));

    expect(result.ok).toBe(true);
    expect(mocks.tx.business.update.mock.calls[0][0].data.currency).toBeUndefined();
  });

  it.each([
    ["an unlisted code", "XXX"],
    ["a zero-decimal currency (cents math would be wrong)", "JPY"],
    ["lower case", "eur"],
    ["an empty string", ""],
    ["free text", "dollars please"],
  ])("refuses %s, before changing anything", async (_label, currency) => {
    const result = await saveSettingsAction(payload(currency));

    expect(result).toEqual({ ok: false, error: "Choose one of the listed currencies." });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.business.update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a non-string currency (client-serialized arguments aren't type-checked at runtime)", async () => {
    const result = await saveSettingsAction(payload({ not: "EUR" } as unknown as string));

    expect(result.ok).toBe(false);
    expect(mocks.tx.business.update).not.toHaveBeenCalled();
  });

  // Codex #131: Business.currency only relabels how amounts render — stored
  // ClientPayment rows have no currency of their own, so changing it once
  // payments exist would silently reinterpret a recorded USD 100.00 as
  // EUR 100.00, misstating the whole ledger and its statements.
  it("blocks the change once the workspace has a payment on record", async () => {
    mocks.tx.clientPayment.count.mockResolvedValue(1);

    const result = await saveSettingsAction(payload("USD"));

    expect(mocks.tx.clientPayment.count).toHaveBeenCalledWith({
      where: { businessId: "biz_1", updatedAt: { gte: CURRENCY_CHOOSABLE_FROM } },
    });
    expect(result).toEqual({
      ok: false,
      error: "Currency can't be changed once payments are on record — it would misstate past amounts.",
    });
    // The check runs inside the transaction (under the financial lock), not
    // before it — so the transaction itself IS entered, but nothing commits:
    // the throw aborts it before business.update is ever reached.
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.business.update).not.toHaveBeenCalled();
  });

  it("allows the change through once payments are checked and none exist", async () => {
    const result = await saveSettingsAction(payload("USD"));

    expect(mocks.tx.clientPayment.count).toHaveBeenCalledWith({
      where: { businessId: "biz_1", updatedAt: { gte: CURRENCY_CHOOSABLE_FROM } },
    });
    expect(result.ok).toBe(true);
  });

  // Codex #130: clinic-currency-migration.sql gave every existing workspace the
  // euro default, although their payments were recorded while amounts were shown
  // in dollars - and the lock above then refused the correction the migration
  // itself tells the owner to make. Payments from before currencies existed were
  // recorded under a label nobody chose, so they don't lock it.
  describe("a workspace whose payments predate the currency setting", () => {
    // Serves the count the way the database would: only payments whose
    // `updatedAt` (the last time one was recorded or edited) satisfies the filter.
    const paymentsWrittenAt = (...dates: string[]) =>
      mocks.tx.clientPayment.count.mockImplementation(
        async ({ where }: { where: { updatedAt?: { gte: Date } } }) =>
          dates.filter((date) => new Date(date) >= (where.updatedAt?.gte ?? new Date(0))).length
      );

    it("can still correct the currency", async () => {
      paymentsWrittenAt("2026-08-15T10:00:00Z", "2026-09-26T23:59:59Z"); // recorded under the old "$" label

      const result = await saveSettingsAction(payload("USD"));

      expect(result.ok).toBe(true);
      expect(mocks.tx.business.update).toHaveBeenCalledWith({
        where: { id: "biz_1" },
        data: expect.objectContaining({ currency: "USD" }),
      });
    });

    it("is locked again by the first payment recorded under a currency it could see and set", async () => {
      paymentsWrittenAt("2026-08-15T10:00:00Z", "2026-10-01T09:00:00Z");

      const result = await saveSettingsAction(payload("USD"));

      expect(result).toEqual({
        ok: false,
        error: "Currency can't be changed once payments are on record — it would misstate past amounts.",
      });
      expect(mocks.tx.business.update).not.toHaveBeenCalled();
    });

    it("counts a payment recorded at the very instant currencies became choosable", async () => {
      paymentsWrittenAt(CURRENCY_CHOOSABLE_FROM.toISOString());

      expect((await saveSettingsAction(payload("USD"))).ok).toBe(false);
    });

    // Codex #130: editing a legacy payment re-enters its amount under the
    // currency now in force, so from then on it must count like any other. Its
    // `createdAt` stays old; it is the edit (`updatedAt`) that locks it.
    it("is locked by a legacy payment that has been edited since, even though it was created long before", async () => {
      // One legacy payment, created in August and edited on 2026-10-01.
      mocks.tx.clientPayment.count.mockImplementation(
        async ({ where }: { where: { updatedAt?: { gte: Date }; createdAt?: { gte: Date } } }) => {
          const payment = { createdAt: new Date("2026-08-15T10:00:00Z"), updatedAt: new Date("2026-10-01T09:00:00Z") };
          const matchesCreated = !where.createdAt || payment.createdAt >= where.createdAt.gte;
          const matchesUpdated = !where.updatedAt || payment.updatedAt >= where.updatedAt.gte;
          return matchesCreated && matchesUpdated ? 1 : 0;
        }
      );

      const result = await saveSettingsAction(payload("USD"));

      expect(result).toEqual({
        ok: false,
        error: "Currency can't be changed once payments are on record — it would misstate past amounts.",
      });
      expect(mocks.tx.business.update).not.toHaveBeenCalled();
    });
  });

  // Codex #131: a plain check-then-update only narrows the gap against a
  // concurrent addClientPaymentAction, it doesn't close it — the same
  // pg_advisory_xact_lock acquired here must be held before the count read,
  // for the rest of this transaction, so the two can't interleave.
  it("acquires the financial lock before checking for existing payments", async () => {
    await saveSettingsAction(payload("USD"));

    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.clientPayment.count.mock.invocationCallOrder[0]
    );
  });

  it("acquires the lock but skips the payment check once the fresh in-transaction read confirms nothing changed", async () => {
    const result = await saveSettingsAction(payload("EUR"));

    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.business.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      select: { currency: true },
    });
    expect(mocks.tx.clientPayment.count).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("never acquires the lock or reads the fresh currency when no currency is submitted at all", async () => {
    const result = await saveSettingsAction(payload(undefined));

    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.business.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.tx.clientPayment.count).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  // Codex #131 round 8: a submitted value matching the pre-transaction
  // `business.currency` snapshot isn't proof nothing is changing — a
  // concurrent request can commit a different currency (and a payment in
  // it) before this transaction acquires the lock. Deciding from the stale
  // snapshot would let this "no-op" save silently overwrite that currency
  // back and mislabel the concurrent payment; the fresh in-transaction read
  // is what must decide, not the snapshot.
  it("blocks a same-as-snapshot save when a concurrent request already changed the currency and recorded a payment", async () => {
    mocks.tx.business.findUniqueOrThrow.mockResolvedValue({ currency: "USD" });
    mocks.tx.clientPayment.count.mockResolvedValue(1);

    // This request read EUR before the transaction and submits EUR — from
    // its own (stale) view, currency isn't changing at all.
    const result = await saveSettingsAction(payload("EUR"));

    expect(result).toEqual({
      ok: false,
      error: "Currency can't be changed once payments are on record — it would misstate past amounts.",
    });
    expect(mocks.tx.business.update).not.toHaveBeenCalled();
  });
});
