import type { BusinessPlan } from "@prisma/client";

import type { Locale } from "@/i18n/config";
import { plural } from "@/i18n/format";
import { messages } from "@/i18n/messages";
import { AUTOMATIONS, defaultAutomationText, effectiveAutomationTemplate, type AutomationKind, type AutomationMode, type AutomationToken, type TimingUnit } from "@/lib/automations";
import type { AutomationSettings } from "@/lib/automations-data";
import { isProBusinessPlan } from "@/lib/billing";

export type AutomationCard = {
  kind: AutomationKind;
  label: string;
  enabled: boolean;
  /** Not in the workspace's plan: shown with a "Pro" label that leads to the upgrade. */
  locked: boolean;
  timingPhrase: string;
  /** How it sends while on (kept when it is off, so switching it on shows the right word). */
  mode: AutomationMode;
  modeLabel: "Automatic" | "Review first" | "Off";
};

/** What the editor needs for one automation; plain data so it crosses to the client. */
export type AutomationEditorData = {
  kind: AutomationKind;
  label: string;
  enabled: boolean;
  mode: AutomationMode;
  timing: number | null;
  timingUnit: TimingUnit | null;
  timingOptions: number[];
  /** The mode picker shows only when the plan has review and the automation can wait for it. */
  canChooseMode: boolean;
  /** The fixed wording when there is no timing, e.g. "Right after booking". */
  fixedTiming: string;
  tokens: AutomationToken[];
  template: string;
  template2: string | null;
  defaultTemplate: string;
  defaultTemplate2: string | null;
};

export type AutomationsView = {
  cards: AutomationCard[];
  editors: Partial<Record<AutomationKind, AutomationEditorData>>;
  showReviewTab: boolean;
  reviewCount: number;
  /** An Albanian reader whose patients still get an English default text. */
  englishWording: boolean;
};

export function buildAutomationsView(args: {
  settings: AutomationSettings;
  plan: BusinessPlan;
  reviewCount: number;
  locale?: Locale;
}): AutomationsView {
  const { settings, plan, reviewCount, locale = "en" } = args;
  const kinds = messages[locale].automations.kinds;
  const isPro = isProBusinessPlan(plan);
  const editors: AutomationsView["editors"] = {};

  const cards = AUTOMATIONS.map((definition): AutomationCard => {
    const setting = settings[definition.kind];
    const locked = !setting.available;
    const copy = kinds[definition.kind];
    const label = copy.label;

    if (!locked) {
      editors[definition.kind] = {
        kind: definition.kind,
        label,
        enabled: setting.enabled,
        mode: setting.mode,
        timing: setting.timing,
        timingUnit: definition.timingUnit,
        timingOptions: [...definition.timingOptions],
        canChooseMode: isPro && definition.reviewable,
        fixedTiming: "fixed" in copy ? copy.fixed : "",
        tokens: [...definition.tokens],
        template: setting.template ?? definition.defaultTemplate,
        template2: definition.defaultTemplate2 ? (setting.template2 ?? definition.defaultTemplate2) : null,
        // What "Reset to default" puts back: the default in the reader's language.
        defaultTemplate: defaultAutomationText(definition.kind, "moved", locale),
        defaultTemplate2: definition.defaultTemplate2 ? defaultAutomationText(definition.kind, "cancelled", locale) : null,
      };
    }

    return {
      kind: definition.kind,
      label,
      enabled: setting.enabled,
      locked,
      timingPhrase:
        typeof copy.card === "string"
          ? copy.card
          : plural(copy.card, setting.timing ?? definition.defaultTiming ?? 0, locale),
      mode: setting.mode,
      modeLabel: !setting.enabled ? "Off" : setting.mode === "REVIEW" ? "Review first" : "Automatic",
    };
  });

  // Basic has no review queue, but a workspace downgraded with a live slot
  // offer still has to reach it to skip or book it (Codex).
  const onEnglishDefault = (kind: AutomationKind, stored: string | null, variant: "moved" | "cancelled") =>
    effectiveAutomationTemplate(kind, stored, variant) === defaultAutomationText(kind, variant);
  const englishWording =
    locale === "sq" &&
    AUTOMATIONS.some(({ kind }) => {
      const setting = settings[kind];
      return (
        setting.available &&
        (onEnglishDefault(kind, setting.template, "moved") ||
          (kind === "VISIT_CHANGED" && onEnglishDefault(kind, setting.template2, "cancelled")))
      );
    });

  return { cards, editors, showReviewTab: isPro || reviewCount > 0, reviewCount, englishWording };
}
