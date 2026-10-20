import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { resolveAutomationSettings } from "@/lib/automations-data";
import { buildAutomationsView } from "@/lib/automations-view";

function view(plan: "BASIC" | "PRO", rows: Parameters<typeof resolveAutomationSettings>[0]["rows"] = []) {
  return buildAutomationsView({
    settings: resolveAutomationSettings({
      plan,
      rows,
      reminders: { send24HourReminder: true, send2HourReminder: true, firstReminderHours: 14, secondReminderHours: 2, template: null },
      workflows: null,
    }),
    plan,
    reviewCount: 3,
  });
}

describe("buildAutomationsView", () => {
  it("lists twelve cards in visit order with their timing in words", () => {
    const { cards } = view("PRO");

    expect(cards).toHaveLength(12);
    expect(cards.map((card) => card.timingPhrase)).toEqual([
      "Right after booking",
      "After a first booking",
      "14 hours before",
      "2 hours before",
      "5 hours before, high risk only",
      "When the clinic changes a visit",
      "2 hours after the visit",
      "1 hour after a no-show",
      "3 days after an unpaid visit",
      "On the follow-up date",
      "6 months since the last visit",
      "When a booking is cancelled",
    ]);
  });

  it("names each card's mode, or Off", () => {
    const cards = Object.fromEntries(view("PRO").cards.map((card) => [card.kind, card.modeLabel]));

    expect(cards.FIRST_REMINDER).toBe("Automatic");
    expect(cards.MISSED_VISIT).toBe("Review first");
    expect(cards.HIGH_RISK_REMINDER).toBe("Off");
    expect(cards.REBOOK).toBe("Off");
  });

  it("locks every Pro automation on Basic and hides the review tab", () => {
    const result = view("BASIC");

    expect(result.cards.filter((card) => card.locked)).toHaveLength(10);
    expect(result.cards.filter((card) => !card.locked).map((card) => card.kind)).toEqual(["FIRST_REMINDER", "THANK_YOU"]);
    expect(result.showReviewTab).toBe(false);
    expect(result.reviewCount).toBe(0);
    expect(Object.keys(result.editors)).toEqual(["FIRST_REMINDER", "THANK_YOU"]);
    expect(result.editors.THANK_YOU?.canChooseMode).toBe(false);
  });

  it("gives the editor the text in force, the default to reset to, and the mode picker only where it applies", () => {
    const { editors } = view("PRO", [
      { kind: "THANK_YOU", enabled: true, mode: "REVIEW", timing: 4, template: "Thanks {client_name}", template2: null },
    ]);

    expect(editors.THANK_YOU).toMatchObject({
      template: "Thanks {client_name}",
      defaultTemplate: "Thank you for visiting us, {client_name}! We hope to see you again soon.",
      mode: "REVIEW",
      timing: 4,
      canChooseMode: true,
      tokens: ["client_name", "clinic_name"],
    });
    expect(editors.FIRST_REMINDER?.canChooseMode).toBe(false);
    expect(editors.VISIT_CHANGED?.template2).toContain("has been cancelled");
    expect(editors.BOOKING_CONFIRMATION?.fixedTiming).toBe("right after booking");
    expect(editors.FIRST_REMINDER?.timingSuffix).toBe("the visit");
  });

  it("offers the high-risk reminder only leads shorter than the first reminder's", () => {
    // First reminder is 14h before (legacy row above); high-risk defaults to 5h.
    const options = view("PRO").editors.HIGH_RISK_REMINDER?.timingOptions ?? [];

    expect(Math.max(...options)).toBe(13);
    expect(options).toContain(5);
  });
});
