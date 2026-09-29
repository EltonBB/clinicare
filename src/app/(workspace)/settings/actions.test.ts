import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const workflowSettings = { upsert: vi.fn() };
  const getCurrentUser = vi.fn();
  const requireCurrentBusiness = vi.fn();
  const revalidatePath = vi.fn();
  return { workflowSettings, getCurrentUser, requireCurrentBusiness, revalidatePath };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { workflowSettings: mocks.workflowSettings },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  updateCurrentUserMetadata: vi.fn(),
}));

vi.mock("@/lib/business", () => ({
  requireCurrentBusiness: mocks.requireCurrentBusiness,
  requireCurrentWorkspace: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/server", () => ({ after: vi.fn() }));

// Unrelated to this file's subject; stubbed so importing actions.ts doesn't
// pull the WhatsApp worker bridge, Storage, or the settings loader's own deps.
// The real WORKFLOW_SETTINGS_SELECT stays in place (the select assertions below
// are about its actual shape); only the loader, which hits the database, is stubbed.
vi.mock("@/lib/settings-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings-server")>(
    "@/lib/settings-server"
  );
  return { ...actual, loadSettingsState: vi.fn() };
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

import { buildWorkflowSavePayload, REBOOK_PLAN_ERROR } from "@/lib/settings";
import { WORKFLOW_SETTINGS_SELECT } from "@/lib/settings-server";
import type { WorkflowSettingsValues } from "@/lib/workflow-generators";

import { saveWorkflowSettingsAction } from "./actions";

const PRO_BUSINESS = { id: "biz_1", plan: "PRO" as const };
const BASIC_BUSINESS = { id: "biz_1", plan: "BASIC" as const };

const VALID_PAYLOAD: WorkflowSettingsValues = {
  rebookEnabled: true,
  rebookAfterMonths: 9,
  paymentReminderEnabled: true,
  paymentReminderAfterDays: 7,
  thankYouEnabled: false,
  thankYouDelayHours: 4,
};

// What the database hands back — deliberately different from every payload in
// this file, so a test that reads it back proves the action returns the
// persisted row rather than echoing its input.
const PERSISTED_ROW: WorkflowSettingsValues = {
  rebookEnabled: false,
  rebookAfterMonths: 3,
  paymentReminderEnabled: false,
  paymentReminderAfterDays: 14,
  thankYouEnabled: true,
  thankYouDelayHours: 24,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "user_1" });
  mocks.requireCurrentBusiness.mockResolvedValue(PRO_BUSINESS);
  mocks.workflowSettings.upsert.mockResolvedValue(PERSISTED_ROW);
});

describe("saveWorkflowSettingsAction — saving", () => {
  it("upserts a Pro workspace's values scoped to its business and revalidates the layout", async () => {
    const result = await saveWorkflowSettingsAction(VALID_PAYLOAD);

    expect(mocks.workflowSettings.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.workflowSettings.upsert).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      update: VALID_PAYLOAD,
      create: { businessId: "biz_1", ...VALID_PAYLOAD },
      select: WORKFLOW_SETTINGS_SELECT,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(result).toEqual({ ok: true, workflows: PERSISTED_ROW });
  });

  it("selects exactly the six editable fields, never id/businessId/updatedAt", async () => {
    await saveWorkflowSettingsAction(VALID_PAYLOAD);

    const { select } = mocks.workflowSettings.upsert.mock.calls[0][0];
    expect(select).toEqual({
      rebookEnabled: true,
      rebookAfterMonths: true,
      paymentReminderEnabled: true,
      paymentReminderAfterDays: true,
      thankYouEnabled: true,
      thankYouDelayHours: true,
    });
  });

  it("takes the business from the session, never from the payload", async () => {
    await saveWorkflowSettingsAction({
      ...VALID_PAYLOAD,
      businessId: "biz_other",
    } as WorkflowSettingsValues);

    const call = mocks.workflowSettings.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ businessId: "biz_1" });
    expect(call.create.businessId).toBe("biz_1");
    expect(JSON.stringify(call)).not.toContain("biz_other");
  });

  it("accepts the smallest and largest allowed values", async () => {
    const low = { ...VALID_PAYLOAD, rebookAfterMonths: 1, paymentReminderAfterDays: 1, thankYouDelayHours: 1 };
    const high = { ...VALID_PAYLOAD, rebookAfterMonths: 24, paymentReminderAfterDays: 30, thankYouDelayHours: 72 };

    expect((await saveWorkflowSettingsAction(low)).ok).toBe(true);
    expect((await saveWorkflowSettingsAction(high)).ok).toBe(true);
  });

  it("refuses when there is no signed-in user, without touching the workspace or database", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const result = await saveWorkflowSettingsAction(VALID_PAYLOAD);

    expect(result.ok).toBe(false);
    expect(mocks.requireCurrentBusiness).not.toHaveBeenCalled();
    expect(mocks.workflowSettings.upsert).not.toHaveBeenCalled();
  });
});

describe("saveWorkflowSettingsAction — Pro gate on the rebooking nudge", () => {
  beforeEach(() => {
    mocks.requireCurrentBusiness.mockResolvedValue(BASIC_BUSINESS);
  });

  it("rejects turning the rebooking nudge on for a Basic workspace and writes nothing", async () => {
    const result = await saveWorkflowSettingsAction({ ...VALID_PAYLOAD, rebookEnabled: true });

    expect(result).toEqual({ ok: false, error: REBOOK_PLAN_ERROR });
    expect(mocks.workflowSettings.upsert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts what the Settings dialog sends for a downgraded workspace that still has rebooking stored on", async () => {
    // Loaded state has rebookEnabled: true (set while on Pro); the dialog's
    // payload builder must turn that into something the Pro gate lets through.
    const payload = buildWorkflowSavePayload({ ...VALID_PAYLOAD, rebookEnabled: true }, false);

    const result = await saveWorkflowSettingsAction(payload);

    expect(result.ok).toBe(true);
    expect(mocks.workflowSettings.upsert).toHaveBeenCalledTimes(1);
  });

  it("saves a Basic workspace's other workflows without ever writing the rebook fields", async () => {
    const result = await saveWorkflowSettingsAction({
      ...VALID_PAYLOAD,
      rebookEnabled: false,
      // Timing edits for a hidden, Pro-only row are ignored, not stored.
      rebookAfterMonths: 12,
    });

    expect(result.ok).toBe(true);
    const { update, create } = mocks.workflowSettings.upsert.mock.calls[0][0];
    const expected = {
      paymentReminderEnabled: true,
      paymentReminderAfterDays: 7,
      thankYouEnabled: false,
      thankYouDelayHours: 4,
    };
    expect(update).toEqual(expected);
    expect(create).toEqual({ businessId: "biz_1", ...expected });
    expect(update).not.toHaveProperty("rebookEnabled");
    expect(update).not.toHaveProperty("rebookAfterMonths");
    expect(create).not.toHaveProperty("rebookEnabled");
    expect(create).not.toHaveProperty("rebookAfterMonths");
  });
});

describe("saveWorkflowSettingsAction — validation", () => {
  const invalidCases: Array<[string, Partial<Record<keyof WorkflowSettingsValues, unknown>>]> = [
    ["rebook months of 0", { rebookAfterMonths: 0 }],
    ["rebook months above 24", { rebookAfterMonths: 25 }],
    ["fractional rebook months", { rebookAfterMonths: 6.5 }],
    ["payment reminder days of 0", { paymentReminderAfterDays: 0 }],
    ["payment reminder days above 30", { paymentReminderAfterDays: 31 }],
    ["fractional payment reminder days", { paymentReminderAfterDays: 2.5 }],
    ["thank-you hours of 0", { thankYouDelayHours: 0 }],
    ["thank-you hours above 72", { thankYouDelayHours: 73 }],
    ["fractional thank-you hours", { thankYouDelayHours: 1.5 }],
    ["negative hours", { thankYouDelayHours: -2 }],
    ["NaN days", { paymentReminderAfterDays: Number.NaN }],
    ["numeric strings", { rebookAfterMonths: "6" }],
    ["a non-boolean switch", { thankYouEnabled: "yes" }],
    ["a missing value", { paymentReminderAfterDays: undefined }],
  ];

  it.each(invalidCases)("rejects %s without writing", async (_name, override) => {
    const result = await saveWorkflowSettingsAction({
      ...VALID_PAYLOAD,
      ...override,
    } as WorkflowSettingsValues);

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(mocks.workflowSettings.upsert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
