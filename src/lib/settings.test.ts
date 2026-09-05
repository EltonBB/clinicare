import { describe, expect, it } from "vitest";
import type { BusinessHours } from "@prisma/client";

import { normalizeWorkingHoursFromDatabase } from "@/lib/settings";

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
