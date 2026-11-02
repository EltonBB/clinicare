import { describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({}) as Record<string, unknown>);
vi.mock("@/lib/prisma", () => ({ prisma }));

import { defaultAutomationText } from "@/lib/automations";
import { effectiveAutomationRow, resolveAutomationSettings, writeAlbanianDefaultWording } from "@/lib/automations-data";

const LEGACY_REMINDERS = {
  send24HourReminder: true,
  send2HourReminder: true,
  firstReminderHours: 14,
  secondReminderHours: 2,
  template: "Hi {client_name}!",
};

const LEGACY_WORKFLOWS = {
  rebookEnabled: true,
  rebookAfterMonths: 9,
  paymentReminderEnabled: false,
  paymentReminderAfterDays: 7,
  thankYouEnabled: true,
  thankYouDelayHours: 4,
};

describe("resolveAutomationSettings", () => {
  it("carries a clinic's existing reminder and workflow settings over", () => {
    const settings = resolveAutomationSettings({
      plan: "PRO",
      rows: [],
      reminders: LEGACY_REMINDERS,
      workflows: LEGACY_WORKFLOWS,
    });

    expect(settings.FIRST_REMINDER).toMatchObject({ enabled: true, timing: 14, template: "Hi {client_name}!" });
    expect(settings.SECOND_REMINDER).toMatchObject({ enabled: true, timing: 2, template: "Hi {client_name}!" });
    expect(settings.REBOOK).toMatchObject({ enabled: true, timing: 9, mode: "REVIEW" });
    expect(settings.PAYMENT_REMINDER).toMatchObject({ enabled: false, timing: 7, mode: "AUTOMATIC" });
    expect(settings.THANK_YOU).toMatchObject({ enabled: true, timing: 4, mode: "AUTOMATIC" });
  });

  it("treats the old and current default reminder text as the default", () => {
    const settings = resolveAutomationSettings({
      plan: "PRO",
      rows: [],
      reminders: {
        ...LEGACY_REMINDERS,
        template:
          "Hi {client_name}, this is a reminder for your appointment at {time} on {date}. Reply here if you need to reschedule.",
      },
      workflows: null,
    });

    expect(settings.FIRST_REMINDER.template).toBeNull();
    expect(settings.SECOND_REMINDER.template).toBeNull();
  });

  it("uses registry defaults when nothing is stored", () => {
    const settings = resolveAutomationSettings({ plan: "PRO", rows: [], reminders: null, workflows: null });

    expect(settings.FIRST_REMINDER).toMatchObject({ enabled: true, timing: 24, mode: "AUTOMATIC" });
    expect(settings.HIGH_RISK_REMINDER).toMatchObject({ enabled: false, timing: 5 });
    expect(settings.MISSED_VISIT).toMatchObject({ enabled: true, timing: 1, mode: "REVIEW" });
    expect(settings.BOOKING_CONFIRMATION).toMatchObject({ enabled: true, timing: null, mode: "AUTOMATIC" });
  });

  it("lets a saved row win over the legacy settings", () => {
    const settings = resolveAutomationSettings({
      plan: "PRO",
      rows: [
        { kind: "FIRST_REMINDER", enabled: false, mode: "AUTOMATIC", timing: 6, template: null, template2: null },
        { kind: "THANK_YOU", enabled: true, mode: "REVIEW", timing: 1, template: "Thanks {client_name}", template2: null },
      ],
      reminders: LEGACY_REMINDERS,
      workflows: LEGACY_WORKFLOWS,
    });

    expect(settings.FIRST_REMINDER).toMatchObject({ enabled: false, timing: 6, template: null });
    expect(settings.THANK_YOU).toMatchObject({ mode: "REVIEW", timing: 1, template: "Thanks {client_name}" });
  });

  it("keeps Basic to the first reminder and an automatic thank-you", () => {
    const settings = resolveAutomationSettings({
      plan: "BASIC",
      rows: [
        { kind: "THANK_YOU", enabled: true, mode: "REVIEW", timing: 2, template: null, template2: null },
        { kind: "REBOOK", enabled: true, mode: "REVIEW", timing: 6, template: null, template2: null },
      ],
      reminders: LEGACY_REMINDERS,
      workflows: LEGACY_WORKFLOWS,
    });

    expect(settings.FIRST_REMINDER).toMatchObject({ enabled: true, available: true, template: "Hi {client_name}!" });
    expect(settings.SECOND_REMINDER).toMatchObject({ enabled: false, available: false });
    expect(settings.THANK_YOU).toMatchObject({ enabled: true, available: true, mode: "AUTOMATIC" });
    expect(settings.REBOOK).toMatchObject({ enabled: false, available: false });
    expect(settings.PAYMENT_REMINDER.enabled).toBe(false);
  });

  it("lets a Pro clinic set a reminder to wait for review", () => {
    const settings = resolveAutomationSettings({
      plan: "PRO",
      rows: [{ kind: "SECOND_REMINDER", enabled: true, mode: "REVIEW", timing: 2, template: null, template2: null }],
      reminders: null,
      workflows: null,
    });

    expect(settings.SECOND_REMINDER.mode).toBe("REVIEW");
  });
});

describe("effectiveAutomationRow", () => {
  it("is the saved row, or what the automation does today without one (plan limits aside)", () => {
    const saved = { kind: "REBOOK" as const, enabled: false, mode: "AUTOMATIC" as const, timing: 3, template: "Hi", template2: null };
    expect(effectiveAutomationRow("REBOOK", { plan: "BASIC", automationSettings: [saved] })).toBe(saved);
    // A Basic clinic's Pro automation keeps its own default, not the plan's "off".
    expect(
      effectiveAutomationRow("REBOOK", { plan: "BASIC", reminderSettings: LEGACY_REMINDERS, workflowSettings: LEGACY_WORKFLOWS })
    ).toMatchObject({ enabled: true, timing: 9, mode: "REVIEW", template: null });
    expect(effectiveAutomationRow("FIRST_REMINDER", { plan: "PRO", reminderSettings: LEGACY_REMINDERS })).toMatchObject({
      enabled: true,
      timing: 14,
      template: "Hi {client_name}!",
    });
  });
});

describe("writeAlbanianDefaultWording", () => {
  function run(automationSettings: unknown[]) {
    const updateMany = vi.fn((args: unknown) => ({ op: "update", args }));
    const createMany = vi.fn((args: unknown) => ({ op: "create", args }));
    Object.assign(prisma, {
      business: { findUnique: async () => ({ plan: "PRO", automationSettings, reminderSettings: null, workflowSettings: null }) },
      automationSetting: { updateMany, createMany },
      $transaction: async (writes: unknown[]) => writes,
    });
    return { updateMany, createMany, done: writeAlbanianDefaultWording("biz") };
  }
  const saved = (kind: string, template: string | null, template2: string | null = null) => ({
    kind,
    enabled: true,
    mode: "AUTOMATIC",
    timing: null,
    template,
    template2,
  });

  it("changes a saved row's wording only while it still holds what was read", async () => {
    const { updateMany, done } = run([saved("FIRST_REMINDER", null)]);
    await done;
    expect(updateMany).toHaveBeenCalledWith({
      where: { businessId: "biz", kind: "FIRST_REMINDER", template: null },
      data: { template: defaultAutomationText("FIRST_REMINDER", "moved", "sq") },
    });
  });

  it("writes only the visit-changed message that still uses the English default", async () => {
    const { updateMany, done } = run([saved("VISIT_CHANGED", "Our own words, {client_name}.", null)]);
    await done;
    const calls = updateMany.mock.calls.map(([args]) => args as { where: { kind: string } });
    expect(calls.filter((args) => args.where.kind === "VISIT_CHANGED")).toEqual([
      {
        where: { businessId: "biz", kind: "VISIT_CHANGED", template2: null },
        data: { template2: defaultAutomationText("VISIT_CHANGED", "cancelled", "sq") },
      },
    ]);
  });

  it("creates a missing row only if none was saved in the meantime", async () => {
    const { createMany, done } = run([]);
    await done;
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(prisma.automationSetting).not.toHaveProperty("upsert");
  });
});
