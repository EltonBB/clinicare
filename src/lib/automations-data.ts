import type { BusinessPlan, ReminderSettings, WorkflowSettings } from "@prisma/client";

import {
  AUTOMATIONS,
  automationDefinition,
  isAutomationAvailable,
  type AutomationKind,
  type AutomationMode,
} from "@/lib/automations";
import { DEFAULT_REMINDER_TEMPLATE, LEGACY_DEFAULT_REMINDER_TEMPLATE } from "@/lib/messaging/render";
import { isProBusinessPlan } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export type AutomationSettingView = {
  kind: AutomationKind;
  enabled: boolean;
  mode: AutomationMode;
  /** Hours, days or months by kind; null for kinds without timing. */
  timing: number | null;
  /** null = the default text. */
  template: string | null;
  template2: string | null;
  /** False when the workspace's plan doesn't include it (it is then never enabled). */
  available: boolean;
};

export type AutomationSettings = Record<AutomationKind, AutomationSettingView>;

type StoredRow = {
  kind: AutomationKind;
  enabled: boolean;
  mode: AutomationMode;
  timing: number | null;
  template: string | null;
  template2: string | null;
};

type LegacyReminders = Pick<
  ReminderSettings,
  "send24HourReminder" | "send2HourReminder" | "firstReminderHours" | "secondReminderHours" | "template"
>;
type LegacyWorkflows = Pick<
  WorkflowSettings,
  | "rebookEnabled"
  | "rebookAfterMonths"
  | "paymentReminderEnabled"
  | "paymentReminderAfterDays"
  | "thankYouEnabled"
  | "thankYouDelayHours"
>;

function clampHours(value: number) {
  return Math.min(Math.max(value, 1), 24);
}

/** A clinic's own reminder wording, or null when it is the (old or current) default. */
function customReminderTemplate(stored: string | null | undefined): string | null {
  const template = stored?.trim();
  if (!template || template === DEFAULT_REMINDER_TEMPLATE || template === LEGACY_DEFAULT_REMINDER_TEMPLATE) {
    return null;
  }
  return template;
}

/**
 * The settings in force before the clinic first saves an automation: what the
 * old Settings → Reminders and Workflows rows said, so nothing a clinic
 * configured there changes on the day the Automations page ships.
 */
function legacyValues(
  kind: AutomationKind,
  reminders: LegacyReminders | null,
  workflows: LegacyWorkflows | null
): Partial<Pick<StoredRow, "enabled" | "timing" | "template">> {
  switch (kind) {
    case "FIRST_REMINDER":
      return reminders
        ? {
            enabled: reminders.send24HourReminder,
            timing: clampHours(reminders.firstReminderHours),
            template: customReminderTemplate(reminders.template),
          }
        : {};
    case "SECOND_REMINDER":
      // Both reminders shared one template; a clinic that wrote its own keeps it on both.
      return reminders
        ? {
            enabled: reminders.send2HourReminder,
            timing: clampHours(reminders.secondReminderHours),
            template: customReminderTemplate(reminders.template),
          }
        : {};
    case "THANK_YOU":
      return workflows ? { enabled: workflows.thankYouEnabled, timing: workflows.thankYouDelayHours } : {};
    case "PAYMENT_REMINDER":
      return workflows
        ? { enabled: workflows.paymentReminderEnabled, timing: workflows.paymentReminderAfterDays }
        : {};
    case "REBOOK":
      return workflows ? { enabled: workflows.rebookEnabled, timing: workflows.rebookAfterMonths } : {};
    default:
      return {};
  }
}

/** Pure merge: stored row, then legacy settings, then the registry default; plan rules applied last. */
export function resolveAutomationSettings(args: {
  plan: BusinessPlan;
  rows: StoredRow[];
  reminders: LegacyReminders | null;
  workflows: LegacyWorkflows | null;
}): AutomationSettings {
  const { plan, rows, reminders, workflows } = args;
  const stored = new Map(rows.map((row) => [row.kind, row]));
  const isPro = isProBusinessPlan(plan);

  return Object.fromEntries(
    AUTOMATIONS.map((definition) => {
      const row = stored.get(definition.kind);
      const legacy = legacyValues(definition.kind, reminders, workflows);
      const available = isAutomationAvailable(definition.kind, plan);
      const view: AutomationSettingView = {
        kind: definition.kind,
        enabled: available && (row?.enabled ?? legacy.enabled ?? definition.defaultEnabled),
        // Basic has no review queue, and a reminder never waits for review.
        mode: isPro && definition.reviewable ? (row?.mode ?? definition.defaultMode) : "AUTOMATIC",
        timing: definition.timingUnit ? (row?.timing ?? legacy.timing ?? definition.defaultTiming) : null,
        template: row ? row.template : (legacy.template ?? null),
        template2: row?.template2 ?? null,
        available,
      };
      return [definition.kind, view];
    })
  ) as AutomationSettings;
}

export async function getAutomationSettings(businessId: string): Promise<AutomationSettings> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      plan: true,
      automationSettings: {
        select: { kind: true, enabled: true, mode: true, timing: true, template: true, template2: true },
      },
      reminderSettings: {
        select: {
          send24HourReminder: true,
          send2HourReminder: true,
          firstReminderHours: true,
          secondReminderHours: true,
          template: true,
        },
      },
      workflowSettings: {
        select: {
          rebookEnabled: true,
          rebookAfterMonths: true,
          paymentReminderEnabled: true,
          paymentReminderAfterDays: true,
          thankYouEnabled: true,
          thankYouDelayHours: true,
        },
      },
    },
  });

  return resolveAutomationSettings({
    plan: business?.plan ?? "BASIC",
    rows: business?.automationSettings ?? [],
    reminders: business?.reminderSettings ?? null,
    workflows: business?.workflowSettings ?? null,
  });
}

/** True when a stored template is just the kind's default (stored as null so default updates reach it). */
export function isDefaultTemplate(kind: AutomationKind, template: string, variant: "moved" | "cancelled" = "moved") {
  const definition = automationDefinition(kind);
  const fallback = variant === "cancelled" ? definition.defaultTemplate2 : definition.defaultTemplate;
  return template.trim() === fallback;
}
