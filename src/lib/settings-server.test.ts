import type { Business } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  businessHours: { findMany: vi.fn() },
  reminderSettings: { findUnique: vi.fn() },
  workflowSettings: { findUnique: vi.fn() },
  whatsAppConnection: { findUnique: vi.fn() },
  resolveMediaDisplayUrl: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    businessHours: mocks.businessHours,
    reminderSettings: mocks.reminderSettings,
    workflowSettings: mocks.workflowSettings,
    whatsAppConnection: mocks.whatsAppConnection,
  },
}));

vi.mock("@/lib/media-storage-server", () => ({
  resolveMediaDisplayUrl: mocks.resolveMediaDisplayUrl,
}));

import { DEFAULT_WORKFLOW_SETTINGS } from "@/lib/workflow-generators";

import { loadSettingsState, WORKFLOW_SETTINGS_SELECT } from "./settings-server";

function businessFor(plan: Business["plan"]) {
  return {
    id: "biz_1",
    name: "Clinic",
    businessType: "Clinic",
    brandAccentColor: "cobalt",
    logoUrl: null,
    whatsappNumber: null,
    whatsappEnabled: false,
    plan,
    planStatus: "ACTIVE",
  } as Business;
}

const user = { email: "owner@example.com", user_metadata: { full_name: "Owner" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.businessHours.findMany.mockResolvedValue([]);
  mocks.reminderSettings.findUnique.mockResolvedValue(null);
  mocks.workflowSettings.findUnique.mockResolvedValue(null);
  mocks.whatsAppConnection.findUnique.mockResolvedValue(null);
  mocks.resolveMediaDisplayUrl.mockResolvedValue("");
});

describe("loadSettingsState — workflow settings", () => {
  it("falls back to the documented defaults when the workspace has no saved row", async () => {
    const state = await loadSettingsState(user, businessFor("BASIC"));

    expect(state.workflows).toEqual(DEFAULT_WORKFLOW_SETTINGS);
  });

  it("returns the saved values when a row exists", async () => {
    const saved = {
      rebookEnabled: true,
      rebookAfterMonths: 12,
      paymentReminderEnabled: false,
      paymentReminderAfterDays: 14,
      thankYouEnabled: false,
      thankYouDelayHours: 24,
    };
    mocks.workflowSettings.findUnique.mockResolvedValue(saved);

    const state = await loadSettingsState(user, businessFor("PRO"));

    expect(state.workflows).toEqual(saved);
  });

  it("reads only this business's row, selecting exactly the six editable fields", async () => {
    await loadSettingsState(user, businessFor("PRO"));

    expect(mocks.workflowSettings.findUnique).toHaveBeenCalledTimes(1);
    const args = mocks.workflowSettings.findUnique.mock.calls[0][0];
    expect(args.where).toEqual({ businessId: "biz_1" });
    // Nothing internal (id, businessId, updatedAt) may reach the client.
    expect(args.select).toEqual({
      rebookEnabled: true,
      rebookAfterMonths: true,
      paymentReminderEnabled: true,
      paymentReminderAfterDays: true,
      thankYouEnabled: true,
      thankYouDelayHours: true,
    });
    expect(args.select).toEqual(WORKFLOW_SETTINGS_SELECT);
  });
});

describe("loadSettingsState — plan flag", () => {
  it.each([
    ["PRO", true],
    ["ADVANCED", true],
    ["BASIC", false],
  ] as const)("reports billing.isPro for a %s plan as %s", async (plan, expected) => {
    const state = await loadSettingsState(user, businessFor(plan));

    expect(state.billing.isPro).toBe(expected);
  });
});
