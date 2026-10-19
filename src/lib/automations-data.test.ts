import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resolveAutomationSettings } from "@/lib/automations-data";

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

  it("never puts a reminder in review, even if a row says so", () => {
    const settings = resolveAutomationSettings({
      plan: "PRO",
      rows: [{ kind: "SECOND_REMINDER", enabled: true, mode: "REVIEW", timing: 2, template: null, template2: null }],
      reminders: null,
      workflows: null,
    });

    expect(settings.SECOND_REMINDER.mode).toBe("AUTOMATIC");
  });
});
