import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    business: { update: vi.fn() },
    businessHours: { upsert: vi.fn() },
    reminderSettings: { upsert: vi.fn() },
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
  mocks.requireCurrentBusiness.mockResolvedValue({ id: "biz_1", name: "Vela Dent", logoUrl: null, plan: "PRO" });
  mocks.prisma.$transaction.mockImplementation(async (run: (tx: typeof mocks.tx) => unknown) => run(mocks.tx));
  mocks.prisma.business.findUniqueOrThrow.mockResolvedValue({ id: "biz_1" });
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
});
