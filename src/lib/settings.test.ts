import { describe, expect, it } from "vitest";
import type { Business, BusinessHours } from "@prisma/client";

import {
  buildSettingsStateFromWorkspace,
  buildWorkflowSavePayload,
  normalizeWorkingHoursFromDatabase,
  REBOOK_MONTH_OPTIONS,
  withCurrentOption,
} from "@/lib/settings";
import type { WorkflowSettingsValues } from "@/lib/workflow-generators";

function businessHoursRow(overrides: {
  weekday: number;
  isOpen: boolean;
  startTime?: string;
  endTime?: string;
}): BusinessHours {
  return {
    id: `bh_${overrides.weekday}`,
    businessId: "biz_1",
    weekday: overrides.weekday,
    isOpen: overrides.isOpen,
    startTime: overrides.startTime ?? "09:00",
    endTime: overrides.endTime ?? "17:00",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("normalizeWorkingHoursFromDatabase", () => {
  it("treats a missing weekday row as closed, not a guessed Mon-Fri 9-5 default", () => {
    // Codex finding: this previously synthesized a missing Mon-Fri row as
    // open — the opposite of the "no row means closed" invariant
    // calendar/actions.ts's isInsideBusinessHours, reports.ts, and
    // new-appointment-form.tsx already enforce. Settings then silently
    // recreated the missing row as open on every save.
    const result = normalizeWorkingHoursFromDatabase([
      businessHoursRow({ weekday: 1, isOpen: true }), // Tuesday only
    ]);

    expect(result.monday.enabled).toBe(false);
    expect(result.wednesday.enabled).toBe(false);
    expect(result.saturday.enabled).toBe(false);
    expect(result.sunday.enabled).toBe(false);
  });

  it("still reflects a real row's own isOpen value, including an explicitly closed weekday", () => {
    const result = normalizeWorkingHoursFromDatabase([
      businessHoursRow({ weekday: 0, isOpen: true, startTime: "08:00", endTime: "16:00" }),
      businessHoursRow({ weekday: 2, isOpen: false }),
    ]);

    expect(result.monday).toEqual({ enabled: true, start: "08:00", end: "16:00" });
    expect(result.wednesday.enabled).toBe(false);
  });
});

describe("withCurrentOption", () => {
  it("returns the listed options unchanged when the saved value is one of them", () => {
    expect(withCurrentOption(REBOOK_MONTH_OPTIONS, 6)).toEqual([3, 6, 9, 12]);
  });

  it("adds a saved value that isn't listed, in order, so the select still displays it", () => {
    expect(withCurrentOption(REBOOK_MONTH_OPTIONS, 5)).toEqual([3, 5, 6, 9, 12]);
    expect(withCurrentOption(REBOOK_MONTH_OPTIONS, 24)).toEqual([3, 6, 9, 12, 24]);
    expect(withCurrentOption(REBOOK_MONTH_OPTIONS, 1)).toEqual([1, 3, 6, 9, 12]);
  });

  it("does not mutate the shared option list", () => {
    withCurrentOption(REBOOK_MONTH_OPTIONS, 5);
    expect([...REBOOK_MONTH_OPTIONS]).toEqual([3, 6, 9, 12]);
  });
});

describe("buildSettingsStateFromWorkspace — workflows", () => {
  const workflows: WorkflowSettingsValues = {
    rebookEnabled: false,
    rebookAfterMonths: 6,
    paymentReminderEnabled: true,
    paymentReminderAfterDays: 3,
    thankYouEnabled: true,
    thankYouDelayHours: 2,
  };

  function stateFor(plan: Business["plan"]) {
    return buildSettingsStateFromWorkspace({
      business: {
        id: "biz_1",
        name: "Clinic",
        businessType: "Clinic",
        brandAccentColor: "cobalt",
        logoUrl: null,
        whatsappNumber: null,
        whatsappEnabled: false,
        plan,
        planStatus: "ACTIVE",
      } as Business,
      supportEmail: "owner@example.com",
      ownerName: "Owner",
      businessHours: [],
      reminderSettings: null,
      workflows,
      whatsappConnection: null,
    });
  }

  it("passes the resolved workflow values through and flags a Pro workspace", () => {
    const state = stateFor("PRO");

    expect(state.workflows).toEqual(workflows);
    expect(state.billing.isPro).toBe(true);
  });

  it("flags a Basic workspace as not Pro", () => {
    expect(stateFor("BASIC").billing.isPro).toBe(false);
  });
});

describe("buildSettingsStateFromWorkspace — currency", () => {
  function stateWithCurrency(currency: string) {
    return buildSettingsStateFromWorkspace({
      business: {
        id: "biz_1",
        name: "Clinic",
        businessType: "Clinic",
        currency,
        brandAccentColor: "cobalt",
        logoUrl: null,
        whatsappNumber: null,
        whatsappEnabled: false,
        plan: "PRO",
        planStatus: "ACTIVE",
      } as Business,
      supportEmail: "owner@example.com",
      ownerName: "Owner",
      businessHours: [],
      reminderSettings: null,
      workflows: {
        rebookEnabled: false,
        rebookAfterMonths: 6,
        paymentReminderEnabled: true,
        paymentReminderAfterDays: 3,
        thankYouEnabled: true,
        thankYouDelayHours: 2,
      },
      whatsappConnection: null,
    });
  }

  it("carries the clinic's stored currency into the editable state", () => {
    expect(stateWithCurrency("GBP").business.currency).toBe("GBP");
    expect(stateWithCurrency("EUR").business.currency).toBe("EUR");
  });

  it("shows a stored value that isn't supported as the default, so it can be resubmitted and saved", () => {
    expect(stateWithCurrency("XXX").business.currency).toBe("EUR");
    expect(stateWithCurrency("").business.currency).toBe("EUR");
  });
});

describe("buildWorkflowSavePayload", () => {
  const stored: WorkflowSettingsValues = {
    rebookEnabled: true,
    rebookAfterMonths: 9,
    paymentReminderEnabled: false,
    paymentReminderAfterDays: 7,
    thankYouEnabled: true,
    thankYouDelayHours: 4,
  };

  it("passes a Pro workspace's values through unchanged, rebooking switch included", () => {
    expect(buildWorkflowSavePayload(stored, true)).toEqual(stored);
    expect(buildWorkflowSavePayload({ ...stored, rebookEnabled: false }, true)).toEqual({
      ...stored,
      rebookEnabled: false,
    });
  });

  it("never sends rebookEnabled: true for a non-Pro workspace, even when a stored true is loaded", () => {
    // A workspace downgraded from Pro still holds rebookEnabled: true, but the
    // row is hidden on Basic — sending it would make the server reject every
    // other workflow change with the Pro-plan error.
    expect(buildWorkflowSavePayload(stored, false).rebookEnabled).toBe(false);
    expect(buildWorkflowSavePayload({ ...stored, rebookEnabled: false }, false).rebookEnabled).toBe(
      false
    );
  });

  it("leaves every other field, rebook timing included, exactly as loaded for a non-Pro workspace", () => {
    expect(buildWorkflowSavePayload(stored, false)).toEqual({ ...stored, rebookEnabled: false });
  });

  it("does not mutate the state object it is given", () => {
    const input = { ...stored };
    buildWorkflowSavePayload(input, false);
    expect(input).toEqual(stored);
  });
});
