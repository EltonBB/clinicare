import { BusinessPlan, type Prisma, type ReminderSettings, type WorkflowSettings } from "@prisma/client";

import {
  AUTOMATIONS,
  automationDefinition,
  defaultAutomationText,
  effectiveAutomationTemplate,
  isAutomationAvailable,
  messageLocale,
  type AutomationKind,
  type AutomationMode,
} from "@/lib/automations";
import { DEFAULT_REMINDER_TEMPLATE, LEGACY_DEFAULT_REMINDER_TEMPLATE } from "@/lib/messaging/render";
import { isProBusinessPlan } from "@/lib/billing";
import { workspaceUsableWhere } from "@/lib/billing-access";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/config";

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

/** Select this on a Business to resolve its automation settings without a second query. */
export const AUTOMATION_SETTINGS_SELECT = {
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
} as const;

export type AutomationSettingsSource = {
  plan: BusinessPlan;
  automationSettings?: StoredRow[] | null;
  reminderSettings?: LegacyReminders | null;
  workflowSettings?: LegacyWorkflows | null;
};

export function automationSettingsFromBusiness(business: AutomationSettingsSource): AutomationSettings {
  return resolveAutomationSettings({
    plan: business.plan,
    rows: business.automationSettings ?? [],
    reminders: business.reminderSettings ?? null,
    workflows: business.workflowSettings ?? null,
  });
}

/**
 * The row an automation behaves as today, before the plan's limits: its saved
 * row, else the old settings, else the registry default (the same order as
 * resolveAutomationSettings). Writing it back changes nothing, so a caller can
 * save one field (the wording) without turning a switch or a mode with it.
 */
export function effectiveAutomationRow(kind: AutomationKind, business: AutomationSettingsSource): StoredRow {
  const row = business.automationSettings?.find((stored) => stored.kind === kind);
  if (row) return row;
  const definition = automationDefinition(kind);
  const legacy = legacyValues(kind, business.reminderSettings ?? null, business.workflowSettings ?? null);
  return {
    kind,
    enabled: legacy.enabled ?? definition.defaultEnabled,
    mode: definition.defaultMode,
    timing: definition.timingUnit ? (legacy.timing ?? definition.defaultTiming) : null,
    template: legacy.template ?? null,
    template2: null,
  };
}

/**
 * Puts the Albanian default wording on every automation still using the
 * English default (lib/automations). Wording the clinic wrote stays, and
 * nothing but the wording changes (effectiveAutomationRow).
 */
export async function writeAlbanianDefaultWording(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: AUTOMATION_SETTINGS_SELECT });
  if (!business) return;
  const albanian = (kind: AutomationKind, stored: string | null, variant: "moved" | "cancelled") =>
    effectiveAutomationTemplate(kind, stored, variant) === defaultAutomationText(kind, variant)
      ? defaultAutomationText(kind, variant, "sq")
      : stored;

  const writes = AUTOMATIONS.flatMap(({ kind }) => {
    const row = effectiveAutomationRow(kind, business);
    const template = albanian(kind, row.template, "moved");
    const template2 = kind === "VISIT_CHANGED" ? albanian(kind, row.template2, "cancelled") : row.template2;
    if (template === row.template && template2 === row.template2) return [];
    return [
      prisma.automationSetting.upsert({
        where: { businessId_kind: { businessId, kind } },
        create: { ...row, businessId, template, template2 },
        update: { template, template2 },
      }),
    ];
  });
  await prisma.$transaction(writes);
}

/**
 * The language a clinic writes to people in: the language of its first
 * reminder's wording. Staff push notifications follow it, since the server
 * can't know a phone's own language when it sends one.
 */
export async function clinicMessageLocale(businessId: string): Promise<Locale> {
  const settings = await getAutomationSettings(businessId);
  return messageLocale(effectiveAutomationTemplate("FIRST_REMINDER", settings.FIRST_REMINDER.template));
}

export async function getAutomationSettings(businessId: string): Promise<AutomationSettings> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: AUTOMATION_SETTINGS_SELECT,
  });

  return automationSettingsFromBusiness(business ?? { plan: "BASIC" });
}

/**
 * Before a clinic saves an automation on the new page, its old Workflows
 * switch decides; without a Workflows row, the old default (rebooking off,
 * the others on). Same precedence as resolveAutomationSettings.
 */
const LEGACY_WORKFLOW_SWITCHES: Partial<Record<AutomationKind, Prisma.WorkflowSettingsWhereInput>> = {
  REBOOK: { rebookEnabled: true },
  PAYMENT_REMINDER: { paymentReminderEnabled: true },
  THANK_YOU: { thankYouEnabled: true },
};
const LEGACY_ON_WITHOUT_ROW: Partial<Record<AutomationKind, boolean>> = {
  REBOOK: false,
  PAYMENT_REMINDER: true,
  THANK_YOU: true,
};

/**
 * "This workspace has this automation on (and its plan includes it)", as a
 * filter on the business a draft belongs to. The review list, its count and
 * every send re-check this, so switching an automation off hides its pending
 * drafts at once and they can't be sent. They are deliberately not expired:
 * generators skip anything that already has a draft of its kind, so expiring
 * them would mean, e.g., a still-unpaid payment never being reminded once the
 * automation is back on.
 */
export function automationEnabledWhere(kind: AutomationKind): Prisma.BusinessWhereInput {
  const definition = automationDefinition(kind);
  const legacySwitch = LEGACY_WORKFLOW_SWITCHES[kind];
  const onWithoutRow: Prisma.BusinessWhereInput | null = legacySwitch
    ? LEGACY_ON_WITHOUT_ROW[kind]
      ? { OR: [{ workflowSettings: { is: null } }, { workflowSettings: { is: legacySwitch } }] }
      : { workflowSettings: { is: legacySwitch } }
    : definition.defaultEnabled
      ? {}
      : null;

  const enabled: Prisma.BusinessWhereInput = {
    OR: [
      { automationSettings: { some: { kind, enabled: true } } },
      ...(onWithoutRow ? [{ AND: [{ automationSettings: { none: { kind } } }, onWithoutRow] }] : []),
    ],
  };

  // A read-only workspace (its plan ended) runs no automation at all.
  if (definition.basic) return { AND: [workspaceUsableWhere(), enabled] };
  const proPlans = Object.values(BusinessPlan).filter((plan) => isProBusinessPlan(plan));
  return { AND: [workspaceUsableWhere(), { plan: { in: proPlans } }, enabled] };
}
