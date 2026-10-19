import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    automationSetting: { upsert: vi.fn() },
    followUpDraft: { updateMany: vi.fn() },
  };
  return {
    getAuthedBusiness: vi.fn(),
    findUnique: vi.fn(),
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/business", () => ({ getAuthedBusiness: mocks.getAuthedBusiness }));
vi.mock("@/lib/prisma", () => ({
  prisma: { business: { findUnique: mocks.findUnique }, $transaction: mocks.transaction },
}));

import { saveAutomationSettingAction, toggleAutomationAction } from "./actions";

function workspace(plan: "BASIC" | "PRO") {
  mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan }, user: { id: "user_1" } });
  mocks.findUnique.mockResolvedValue({
    plan,
    automationSettings: [],
    reminderSettings: null,
    workflowSettings: null,
  });
}

const base = { enabled: true, mode: "AUTOMATIC" as const, timing: null, template: null, template2: null };

beforeEach(() => {
  vi.clearAllMocks();
  workspace("PRO");
});

describe("saveAutomationSettingAction", () => {
  it("refuses a Pro automation on Basic", async () => {
    workspace("BASIC");

    const result = await saveAutomationSettingAction({ ...base, kind: "REBOOK", timing: 6 });

    expect(result).toEqual({ ok: false, error: expect.stringContaining("Pro") });
    expect(mocks.tx.automationSetting.upsert).not.toHaveBeenCalled();
  });

  it("accepts a listed time and refuses one outside the list", async () => {
    expect(await saveAutomationSettingAction({ ...base, kind: "FIRST_REMINDER", timing: 7 })).toEqual({ ok: true });
    expect(await saveAutomationSettingAction({ ...base, kind: "FIRST_REMINDER", timing: 25 })).toMatchObject({ ok: false });
  });

  it("stores the default text as null so it keeps following the default", async () => {
    await saveAutomationSettingAction({
      ...base,
      kind: "MISSED_VISIT",
      timing: 1,
      template: "Hi {client_name}, we missed you today. Would you like to book a new time?",
    });

    expect(mocks.tx.automationSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ template: null }) })
    );
  });

  it("refuses a message over 600 characters", async () => {
    const result = await saveAutomationSettingAction({ ...base, kind: "THANK_YOU", timing: 2, template: "a".repeat(601) });

    expect(result).toMatchObject({ ok: false });
  });

  it("stops queued drafts sending on their own when an automation is turned off", async () => {
    await saveAutomationSettingAction({ ...base, kind: "PAYMENT_REMINDER", enabled: false, timing: 3 });

    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        autoSend: true,
        kind: { in: ["PAYMENT"] },
        OR: [{ status: "PENDING" }, { status: "SENT", sentAt: null }],
      },
      data: { autoSend: false },
    });
  });

  it("never dismisses drafts, so an unpaid payment is reminded again once switched back on", async () => {
    await saveAutomationSettingAction({ ...base, kind: "PAYMENT_REMINDER", enabled: false, timing: 3 });

    expect(mocks.tx.followUpDraft.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "DISMISSED" } })
    );
  });

  it("touches no drafts for a reminder", async () => {
    await saveAutomationSettingAction({ ...base, kind: "FIRST_REMINDER", enabled: false, timing: 24 });

    expect(mocks.tx.followUpDraft.updateMany).not.toHaveBeenCalled();
  });

  it("hands queued automatic sends to review when switched to review", async () => {
    await saveAutomationSettingAction({ ...base, kind: "THANK_YOU", mode: "REVIEW", timing: 2 });

    expect(mocks.tx.followUpDraft.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        autoSend: true,
        kind: { in: ["THANK_YOU"] },
        OR: [{ status: "PENDING" }, { status: "SENT", sentAt: null }],
      },
      data: { autoSend: false },
    });
  });

  it("keeps a Basic thank-you automatic whatever mode is sent", async () => {
    workspace("BASIC");

    await saveAutomationSettingAction({ ...base, kind: "THANK_YOU", mode: "REVIEW", timing: 2 });

    expect(mocks.tx.automationSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ mode: "AUTOMATIC" }) })
    );
  });

  it("never stores a reminder in review", async () => {
    await saveAutomationSettingAction({ ...base, kind: "SECOND_REMINDER", mode: "REVIEW", timing: 2 });

    expect(mocks.tx.automationSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ mode: "AUTOMATIC" }) })
    );
  });

  it("returns the session error when signed out", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ error: "Your session expired." });

    expect(await saveAutomationSettingAction({ ...base, kind: "THANK_YOU", timing: 2 })).toEqual({
      ok: false,
      error: "Your session expired.",
    });
  });
});

describe("toggleAutomationAction", () => {
  it("turns an automation off keeping its other settings", async () => {
    expect(await toggleAutomationAction("BOOKING_CONFIRMATION", false)).toEqual({ ok: true });
    expect(mocks.tx.automationSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ kind: "BOOKING_CONFIRMATION", enabled: false }) })
    );
  });

  it("rejects an unknown kind", async () => {
    expect(await toggleAutomationAction("NOPE" as never, true)).toMatchObject({ ok: false });
  });
});
