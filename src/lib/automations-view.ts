import type { BusinessPlan } from "@prisma/client";

import { AUTOMATIONS, type AutomationKind, type AutomationMode, type AutomationToken, type TimingUnit } from "@/lib/automations";
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
  /** The sentence's fixed wording when there is no timing, e.g. "right after booking". */
  fixedTiming: string;
  /** What the timing counts from, e.g. "the visit" in "Send 14 hours before the visit". */
  timingSuffix: string;
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
};

const TIMING_SUFFIX: Partial<Record<AutomationKind, string>> = {
  FIRST_REMINDER: "the visit",
  SECOND_REMINDER: "the visit",
  HIGH_RISK_REMINDER: "a high-risk visit",
  THANK_YOU: "the visit",
  MISSED_VISIT: "a no-show is recorded",
  PAYMENT_REMINDER: "an unpaid payment is recorded",
  REBOOK: "a patient's last visit",
};

const FIXED_TIMING: Partial<Record<AutomationKind, string>> = {
  BOOKING_CONFIRMATION: "right after booking",
  NEW_PATIENT_WELCOME: "after a patient's first booking",
  VISIT_CHANGED: "when the clinic moves or cancels a visit",
  CHECKUP_DUE: "on the follow-up date set on the patient's record",
  WAITLIST_OFFER: "when a booking is cancelled and someone on the waiting list fits",
};

export function buildAutomationsView(args: {
  settings: AutomationSettings;
  plan: BusinessPlan;
  reviewCount: number;
}): AutomationsView {
  const { settings, plan, reviewCount } = args;
  const isPro = isProBusinessPlan(plan);
  const editors: AutomationsView["editors"] = {};

  const cards = AUTOMATIONS.map((definition): AutomationCard => {
    const setting = settings[definition.kind];
    const locked = !setting.available;

    if (!locked) {
      editors[definition.kind] = {
        kind: definition.kind,
        label: definition.label,
        enabled: setting.enabled,
        mode: setting.mode,
        timing: setting.timing,
        timingUnit: definition.timingUnit,
        timingOptions: [...definition.timingOptions],
        canChooseMode: isPro && definition.reviewable,
        fixedTiming: FIXED_TIMING[definition.kind] ?? "",
        timingSuffix: TIMING_SUFFIX[definition.kind] ?? "",
        tokens: [...definition.tokens],
        template: setting.template ?? definition.defaultTemplate,
        template2: definition.defaultTemplate2 ? (setting.template2 ?? definition.defaultTemplate2) : null,
        defaultTemplate: definition.defaultTemplate,
        defaultTemplate2: definition.defaultTemplate2 ?? null,
      };
    }

    return {
      kind: definition.kind,
      label: definition.label,
      enabled: setting.enabled,
      locked,
      timingPhrase: definition.timingPhrase(setting.timing),
      mode: setting.mode,
      modeLabel: !setting.enabled ? "Off" : setting.mode === "REVIEW" ? "Review first" : "Automatic",
    };
  });

  // Basic has no review queue, but a workspace downgraded with a live slot
  // offer still has to reach it to skip or book it (Codex).
  return { cards, editors, showReviewTab: isPro || reviewCount > 0, reviewCount };
}
