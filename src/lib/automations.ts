import type { AutomationKind, AutomationMode, BusinessPlan, FollowUpDraftKind } from "@prisma/client";

import { isProBusinessPlan } from "@/lib/billing";
import { DEFAULT_REMINDER_TEMPLATE, LEGACY_DEFAULT_REMINDER_TEMPLATE } from "@/lib/messaging/render";
import { PAYMENT_REMINDER_DAY_OPTIONS, REBOOK_MONTH_OPTIONS, THANK_YOU_HOUR_OPTIONS } from "@/lib/settings";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";
import type { Locale } from "@/i18n/config";

export type { AutomationKind, AutomationMode };

/** Longest message a clinic can save for one automation. */
export const MAX_AUTOMATION_MESSAGE_LENGTH = 600;

export type AutomationGroup = "before" | "after" | "return";

/**
 * The only details an automated message may carry: minimum-necessary, never
 * clinical. Each kind allows a subset; any other `{token}` renders empty.
 */
export type AutomationToken = "client_name" | "date" | "time" | "staff_name" | "clinic_name";

export type TimingUnit = "hours_before" | "hours_after" | "days_after" | "months_after";

export type AutomationDefinition = {
  kind: AutomationKind;
  group: AutomationGroup;
  /** English name for logs; the page shows `automations.kinds` from the dictionary. */
  label: string;
  timingUnit: TimingUnit | null;
  timingOptions: readonly number[];
  defaultTiming: number | null;
  defaultMode: AutomationMode;
  defaultEnabled: boolean;
  /** Available on Basic (always automatic there). Everything else is Pro. */
  basic: boolean;
  /**
   * Can wait in To review. Every automation can since 2026-10-20 (owner
   * decision): a reminder set to review is drafted when it falls due and sent
   * by a person. Basic has no review queue, so there everything is automatic.
   */
  reviewable: boolean;
  tokens: readonly AutomationToken[];
  defaultTemplate: string;
  /** VISIT_CHANGED only: the "cancelled" text. */
  defaultTemplate2?: string;
};

const VISIT_TOKENS: readonly AutomationToken[] = ["client_name", "date", "time", "staff_name", "clinic_name"];
const NAME_TOKENS: readonly AutomationToken[] = ["client_name", "clinic_name"];
const HOURS_1_TO_24 = Array.from({ length: 24 }, (_, index) => index + 1);

export const AUTOMATIONS: readonly AutomationDefinition[] = [
  {
    kind: "BOOKING_CONFIRMATION",
    group: "before",
    label: "Booking confirmation",
    timingUnit: null,
    timingOptions: [],
    defaultTiming: null,
    defaultMode: "AUTOMATIC",
    defaultEnabled: true,
    basic: false,
    reviewable: true,
    tokens: VISIT_TOKENS,
    defaultTemplate:
      "Hi {client_name}, your visit at {clinic_name} is booked for {date} at {time}. Reply here if you need to change it.",
  },
  {
    kind: "NEW_PATIENT_WELCOME",
    group: "before",
    label: "New patient welcome",
    timingUnit: null,
    timingOptions: [],
    defaultTiming: null,
    defaultMode: "AUTOMATIC",
    defaultEnabled: true,
    basic: false,
    reviewable: true,
    tokens: VISIT_TOKENS,
    defaultTemplate:
      "Welcome to {clinic_name}, {client_name}! Your first visit is on {date} at {time}. Reply here if you have any questions.",
  },
  {
    kind: "FIRST_REMINDER",
    group: "before",
    label: "First reminder",
    timingUnit: "hours_before",
    timingOptions: HOURS_1_TO_24,
    defaultTiming: 24,
    defaultMode: "AUTOMATIC",
    defaultEnabled: true,
    basic: true,
    reviewable: true,
    tokens: VISIT_TOKENS,
    defaultTemplate: DEFAULT_REMINDER_TEMPLATE,
  },
  {
    kind: "SECOND_REMINDER",
    group: "before",
    label: "Second reminder",
    timingUnit: "hours_before",
    timingOptions: HOURS_1_TO_24,
    defaultTiming: 2,
    defaultMode: "AUTOMATIC",
    defaultEnabled: true,
    basic: false,
    reviewable: true,
    tokens: VISIT_TOKENS,
    defaultTemplate: "Hi {client_name}, see you at {time} on {date}. Reply 2 if you can't make it.",
  },
  {
    kind: "HIGH_RISK_REMINDER",
    group: "before",
    label: "High-risk reminder",
    timingUnit: "hours_before",
    timingOptions: HOURS_1_TO_24,
    defaultTiming: 5,
    defaultMode: "AUTOMATIC",
    defaultEnabled: false,
    basic: false,
    reviewable: true,
    tokens: VISIT_TOKENS,
    defaultTemplate:
      "Hi {client_name}, can you still make your visit at {time} on {date}? Reply 1 to confirm or 2 to cancel so we can offer the time to someone else.",
  },
  {
    kind: "VISIT_CHANGED",
    group: "before",
    label: "Visit moved or cancelled",
    timingUnit: null,
    timingOptions: [],
    defaultTiming: null,
    defaultMode: "AUTOMATIC",
    defaultEnabled: true,
    basic: false,
    reviewable: true,
    tokens: VISIT_TOKENS,
    defaultTemplate: "Hi {client_name}, your visit has moved to {date} at {time}. Reply here if the new time doesn't suit you.",
    defaultTemplate2: "Hi {client_name}, your visit on {date} at {time} has been cancelled. Reply here to book a new time.",
  },
  {
    kind: "THANK_YOU",
    group: "after",
    label: "Thank-you",
    timingUnit: "hours_after",
    timingOptions: THANK_YOU_HOUR_OPTIONS,
    defaultTiming: 2,
    defaultMode: "AUTOMATIC",
    defaultEnabled: true,
    basic: true,
    reviewable: true,
    tokens: NAME_TOKENS,
    defaultTemplate: "Thank you for visiting us, {client_name}! We hope to see you again soon.",
  },
  {
    kind: "MISSED_VISIT",
    group: "after",
    label: "Missed visit",
    timingUnit: "hours_after",
    timingOptions: HOURS_1_TO_24,
    defaultTiming: 1,
    defaultMode: "REVIEW",
    defaultEnabled: true,
    basic: false,
    reviewable: true,
    tokens: NAME_TOKENS,
    defaultTemplate: "Hi {client_name}, we missed you today. Would you like to book a new time?",
  },
  {
    kind: "PAYMENT_REMINDER",
    group: "after",
    label: "Payment reminder",
    timingUnit: "days_after",
    timingOptions: PAYMENT_REMINDER_DAY_OPTIONS,
    defaultTiming: 3,
    defaultMode: "AUTOMATIC",
    defaultEnabled: true,
    basic: false,
    reviewable: true,
    tokens: NAME_TOKENS,
    defaultTemplate:
      "Hi {client_name}, a friendly reminder that you have an unpaid payment with us. Please get in touch if you have any questions.",
  },
  {
    kind: "CHECKUP_DUE",
    group: "return",
    label: "Check-up due",
    timingUnit: null,
    timingOptions: [],
    defaultTiming: null,
    defaultMode: "REVIEW",
    defaultEnabled: true,
    basic: false,
    reviewable: true,
    tokens: NAME_TOKENS,
    defaultTemplate: "Hi {client_name}, it's time for your check-up at {clinic_name}. Would you like to book a visit?",
  },
  {
    kind: "REBOOK",
    group: "return",
    label: "Rebooking nudge",
    timingUnit: "months_after",
    timingOptions: REBOOK_MONTH_OPTIONS,
    defaultTiming: 6,
    defaultMode: "REVIEW",
    defaultEnabled: false,
    basic: false,
    reviewable: true,
    tokens: NAME_TOKENS,
    defaultTemplate: "Hi {client_name}, it's been a while since your last visit. Want to book your next appointment?",
  },
  {
    kind: "WAITLIST_OFFER",
    group: "return",
    label: "Waiting-list offer",
    timingUnit: null,
    timingOptions: [],
    defaultTiming: null,
    defaultMode: "REVIEW",
    defaultEnabled: true,
    basic: false,
    reviewable: true,
    tokens: ["client_name", "date", "time", "clinic_name"],
    defaultTemplate: "Hi {client_name}, a slot has opened up on {date} at {time}. Reply here if you'd like it.",
  },
];

const BY_KIND = new Map(AUTOMATIONS.map((automation) => [automation.kind, automation]));

export function automationDefinition(kind: AutomationKind): AutomationDefinition {
  const definition = BY_KIND.get(kind);
  if (!definition) throw new Error(`Unknown automation: ${kind}`);
  return definition;
}

export function isAutomationAvailable(kind: AutomationKind, plan: BusinessPlan): boolean {
  return automationDefinition(kind).basic || isProBusinessPlan(plan);
}

/** Which automation produces each kind of follow-up draft. */
export const FOLLOW_UP_KIND_TO_AUTOMATION: Record<FollowUpDraftKind, AutomationKind> = {
  SLOT_OFFER: "WAITLIST_OFFER",
  REBOOK: "REBOOK",
  PAYMENT: "PAYMENT_REMINDER",
  THANK_YOU: "THANK_YOU",
  BOOKING_CONFIRMATION: "BOOKING_CONFIRMATION",
  NEW_PATIENT_WELCOME: "NEW_PATIENT_WELCOME",
  VISIT_CHANGED: "VISIT_CHANGED",
  MISSED_VISIT: "MISSED_VISIT",
  CHECKUP_DUE: "CHECKUP_DUE",
  FIRST_REMINDER: "FIRST_REMINDER",
  SECOND_REMINDER: "SECOND_REMINDER",
  HIGH_RISK_REMINDER: "HIGH_RISK_REMINDER",
};

const REMINDER_KINDS = new Set<AutomationKind>(["FIRST_REMINDER", "SECOND_REMINDER", "HIGH_RISK_REMINDER"]);

/**
 * The default wording in Albanian. A clinic's patients get the words the clinic
 * saved, so a clinic writing in Albanian saves these (Reset to default, or
 * "Write every message in Albanian" on the Automations page); nothing saved
 * still means the English default above. Same details, same reply numbers, and
 * every text carries an ë or ç, which is how messageLocale tells the language.
 */
const ALBANIAN_DEFAULTS: Record<AutomationKind, string> = {
  BOOKING_CONFIRMATION:
    "Përshëndetje {client_name}, vizita juaj te {clinic_name} është caktuar më {date} në orën {time}. Na shkruani këtu nëse duhet ta ndryshoni.",
  NEW_PATIENT_WELCOME:
    "Mirë se vini te {clinic_name}, {client_name}! Vizita juaj e parë është më {date} në orën {time}. Na shkruani këtu nëse keni pyetje.",
  FIRST_REMINDER:
    "Përshëndetje {client_name}, ju kujtojmë terminin tuaj më {date} në orën {time}. Përgjigjuni me 1 për ta konfirmuar ose me 2 për ta anuluar.",
  SECOND_REMINDER: "Përshëndetje {client_name}, ju presim në orën {time} më {date}. Përgjigjuni me 2 nëse nuk mund të vini.",
  HIGH_RISK_REMINDER:
    "Përshëndetje {client_name}, a mund të vini ende në vizitën tuaj në orën {time} më {date}? Përgjigjuni me 1 për ta konfirmuar ose me 2 për ta anuluar, që t'ia ofrojmë orarin dikujt tjetër.",
  VISIT_CHANGED:
    "Përshëndetje {client_name}, vizita juaj u zhvendos më {date} në orën {time}. Na shkruani këtu nëse orari i ri nuk ju përshtatet.",
  THANK_YOU: "Faleminderit që na vizituat, {client_name}! Shpresojmë t'ju shohim përsëri së shpejti.",
  MISSED_VISIT: "Përshëndetje {client_name}, sot ju prisnim, por nuk erdhët. Dëshironi të caktoni një orë të re?",
  PAYMENT_REMINDER:
    "Përshëndetje {client_name}, ju kujtojmë me mirësjellje se keni një pagesë të papaguar te ne. Na kontaktoni nëse keni pyetje.",
  CHECKUP_DUE: "Përshëndetje {client_name}, është koha për kontrollin tuaj te {clinic_name}. Dëshironi të caktoni një vizitë?",
  REBOOK: "Përshëndetje {client_name}, ka kaluar pak kohë nga vizita juaj e fundit. Dëshironi të caktoni terminin e radhës?",
  WAITLIST_OFFER: "Përshëndetje {client_name}, u lirua një orar më {date} në orën {time}. Na shkruani këtu nëse e dëshironi.",
};
const ALBANIAN_VISIT_CANCELLED =
  "Përshëndetje {client_name}, vizita juaj më {date} në orën {time} u anulua. Na shkruani këtu për të caktuar një orë të re.";

/** The kind's default text ("cancelled" is VISIT_CHANGED's second text), in English unless asked for Albanian. */
export function defaultAutomationText(
  kind: AutomationKind,
  variant: "moved" | "cancelled" = "moved",
  locale: Locale = "en"
): string {
  if (locale === "sq") return variant === "cancelled" && kind === "VISIT_CHANGED" ? ALBANIAN_VISIT_CANCELLED : ALBANIAN_DEFAULTS[kind];
  const definition = automationDefinition(kind);
  return variant === "cancelled" ? (definition.defaultTemplate2 ?? definition.defaultTemplate) : definition.defaultTemplate;
}

/** The language a message is written in: Albanian text has an ë or a ç, English never does. */
export function messageLocale(text: string): Locale {
  return /[ëç]/i.test(text) ? "sq" : "en";
}

/** A visit's {date} and {time}, written the way the message around them is ("3 nëntor 2026" in Albanian). */
export function visitDateTokens(
  kind: AutomationKind,
  template: string | null | undefined,
  at: Date,
  variant: "moved" | "cancelled" = "moved"
): { date: string; time: string } {
  const locale = messageLocale(effectiveAutomationTemplate(kind, template, variant));
  return { date: formatZonedFullDate(at, undefined, locale), time: formatZonedTime(at, undefined, locale) };
}

/**
 * The text in force for a stored template: the kind's default when it is
 * empty, or, for reminders, the old pre-reply default that onboarding saved
 * into early workspaces (see messaging/render.ts).
 */
export function effectiveAutomationTemplate(
  kind: AutomationKind,
  stored: string | null | undefined,
  variant: "moved" | "cancelled" = "moved"
): string {
  const fallback = defaultAutomationText(kind, variant);
  const template = stored?.trim();
  if (!template) return fallback;
  if (REMINDER_KINDS.has(kind) && template === LEGACY_DEFAULT_REMINDER_TEMPLATE) return fallback;
  return template;
}

/**
 * Renders any automated message. Minimum-necessary by construction: only the
 * kind's whitelisted tokens are filled; `{service}`, `{notes}` or anything
 * else renders empty, so clinical detail can't ride out on a custom template.
 */
export function renderAutomationMessage(
  kind: AutomationKind,
  template: string | null | undefined,
  values: Partial<Record<AutomationToken, string>>,
  variant: "moved" | "cancelled" = "moved"
): string {
  const allowed = automationDefinition(kind).tokens as readonly string[];
  return effectiveAutomationTemplate(kind, template, variant).replace(/\{(\w+)\}/g, (_, key: string) =>
    allowed.includes(key) ? (values[key as AutomationToken] ?? "") : ""
  );
}

/** Inserts `{token}` at the cursor (the editor's "+ Insert detail"). */
export function insertTokenAt(text: string, cursor: number, token: AutomationToken): { text: string; cursor: number } {
  const at = Math.max(0, Math.min(cursor, text.length));
  const inserted = `{${token}}`;
  return { text: text.slice(0, at) + inserted + text.slice(at), cursor: at + inserted.length };
}
