import { describe, expect, it } from "vitest";
import type { Business } from "@prisma/client";

import {
  buildDashboardViewFromWorkspace,
  buildRevenueSummary,
  buildVisitsSummary,
  type DashboardAppointmentAggregates,
  type DashboardPaymentStatusGroup,
} from "@/lib/dashboard";

function group(status: string, amountCents: number | null): DashboardPaymentStatusGroup {
  return { status, _sum: { amountCents } };
}

describe("buildRevenueSummary", () => {
  it("sums only paid revenue from the per-status groups", () => {
    const summary = buildRevenueSummary(
      [
        group("Paid", 10000),
        group("Unpaid", 5000),
        group("Partially Paid", 3000),
        group("Refunded", 2000),
      ],
      "USD"
    );

    expect(summary.monthToDateDisplay).toBe("$100"); // dashboard money is whole-unit
  });

  it("shows the total in the clinic's own currency", () => {
    const groups = [group("Paid", 10000), group("Unpaid", 5000)];

    expect(buildRevenueSummary(groups, "EUR").monthToDateDisplay).toBe("€100");
    expect(buildRevenueSummary(groups, "GBP").monthToDateDisplay).toBe("£100");
  });

  it("treats no payment groups as an empty month", () => {
    expect(buildRevenueSummary([], "USD").monthToDateDisplay).toBe("$0");
  });

  it("ignores Refunded (matches prior behavior)", () => {
    expect(buildRevenueSummary([group("Refunded", 9999)], "USD").monthToDateDisplay).toBe("$0");
  });

  it("tolerates a null sum (no rows in a status bucket)", () => {
    expect(buildRevenueSummary([group("Paid", null)], "USD").monthToDateDisplay).toBe("$0");
  });
});

describe("buildVisitsSummary", () => {
  // Fixed reference day; UTC zone keeps day keys == calendar dates.
  const now = new Date("2026-06-23T12:00:00.000Z");

  it("splits the window into last-7 bars and 30-day totals", () => {
    const summary = buildVisitsSummary({
      now,
      timeZone: "UTC",
      allTime: 100,
      visitCountsByDay: [
        { key: "2026-06-23", count: 3 }, // offset 0 (today, in last 7)
        { key: "2026-06-22", count: 2 }, // offset 1 (last 7)
        { key: "2026-06-17", count: 1 }, // offset 6 (last 7)
        { key: "2026-06-16", count: 5 }, // offset 7 (outside the last 7, inside the 30 days)
        { key: "2026-06-10", count: 4 }, // offset 13
        { key: "2026-05-30", count: 9 }, // still in the 30-day total
        { key: "2026-05-01", count: 7 }, // outside the 30-day window entirely
      ],
    });

    expect(summary.days).toHaveLength(7);
    expect(summary.days.at(-1)?.isToday).toBe(true);
    expect(summary.lastSevenDays).toBe(6); // 3 + 2 + 1
    expect(summary.lastThirtyDays).toBe(24); // last 30 day keys only; excludes 2026-05-01
    expect(summary.thisMonth).toBe(15); // June buckets only; excludes both May buckets
    expect(summary.allTime).toBe(100);
  });

  it("counts the 1st of a 31-day month in this month but not in the rolling 30 days", () => {
    const summary = buildVisitsSummary({
      now: new Date("2026-08-31T12:00:00.000Z"),
      timeZone: "UTC",
      allTime: 0,
      visitCountsByDay: [
        { key: "2026-08-31", count: 1 }, // today
        { key: "2026-08-02", count: 2 }, // offset 29, last day of the 30-day window
        { key: "2026-08-01", count: 4 }, // offset 30: month-to-date only
        { key: "2026-07-31", count: 8 }, // previous month
      ],
    });

    expect(summary.thisMonth).toBe(7); // 1 + 2 + 4
    expect(summary.lastThirtyDays).toBe(3); // 1 + 2
  });

  // 00:30 local on the first weekday after the clock change: a 24-hour step back
  // from here lands on the wrong calendar day in that zone, so day keys must come
  // from calendar arithmetic. Expected keys are built independently of the code.
  it.each([
    ["Europe/Budapest", "2026-03-29T22:30:00.000Z", "2026-03-30"],
    ["America/New_York", "2026-03-09T04:30:00.000Z", "2026-03-09"],
  ])("walks calendar days in %s across a DST change", (timeZone, nowIso, todayKey) => {
    const keysEndingAt = (count: number) => {
      const [year, month, day] = todayKey.split("-").map(Number);

      return Array.from({ length: count }, (_, index) =>
        new Date(Date.UTC(year, month - 1, day - (count - 1 - index))).toISOString().slice(0, 10)
      );
    };
    const thirtyDays = keysEndingAt(30);
    const summary = buildVisitsSummary({
      now: new Date(nowIso),
      timeZone,
      allTime: 0,
      visitCountsByDay: [
        ...thirtyDays.map((key) => ({ key, count: 1 })),
        { key: keysEndingAt(31)[0], count: 100 }, // the day before the 30-day window
      ],
    });

    expect(summary.days.map((day) => day.key)).toEqual(keysEndingAt(7));
    expect(summary.days.at(-1)?.label).toBe("Mon");
    expect(summary.days.at(-1)?.isToday).toBe(true);
    expect(summary.lastSevenDays).toBe(7);
    expect(summary.lastThirtyDays).toBe(30);
  });
});

describe("buildDashboardViewFromWorkspace — no-show risk", () => {
  const now = new Date("2026-06-23T12:00:00.000Z");

  const BASE_BUSINESS: Business = {
    id: "biz_1",
    ownerId: "owner_1",
    name: "Snapshot Clinic",
    businessType: "clinic",
    currency: "EUR",
    logoUrl: null,
    dashboardFocus: "appointments",
    brandAccentColor: null,
    plan: "PRO",
    planStatus: "ACTIVE",
    whatsappNumber: null,
    whatsappEnabled: false,
    trialEndsAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const EMPTY_AGGREGATES: DashboardAppointmentAggregates = {
    recentCompleted: 0,
    recentCancelled: 0,
    recentNoShow: 0,
    completedThisMonth: 0,
    averageDurationMinutes: 0,
    visitCountsByDay: [],
  };

  const APPT_FIXTURE = {
    id: "appt_1",
    businessId: "biz_1",
    clientId: "client_1",
    staffMemberId: "staff_1",
    title: "Cleaning",
    startAt: new Date("2026-06-23T14:00:00.000Z"),
    endAt: new Date("2026-06-23T14:30:00.000Z"),
    status: "PENDING" as const,
    notes: null,
    createdAt: now,
    updatedAt: now,
    cancelledAt: null,
    cancelledScheduledStartAt: null,
    client: { name: "Ava Patient" },
    staffMember: { name: "Dr. One" },
  };

  const BASE_ARGS = {
    business: BASE_BUSINESS,
    lastClients: [],
    nextAppointment: null,
    unreadCount: 0,
    todaysHours: 8,
    clientCount: 1,
    appointmentCount: 1,
    allTimeVisitCount: 0,
    appointmentAggregates: EMPTY_AGGREGATES,
    now,
    timeZone: "UTC",
  };

  it("attaches a risk assessment to a schedule appointment when one is provided", () => {
    const risk = new Map([
      [
        "appt_1",
        { level: "high" as const, reasons: ["Missed a recent appointment"], insufficientHistory: false },
      ],
    ]);
    const view = buildDashboardViewFromWorkspace({
      ...BASE_ARGS,
      appointments: [APPT_FIXTURE],
      noShowRisk: risk,
    });

    expect(view.appointments[0]?.risk).toEqual({
      level: "high",
      reasons: ["Missed a recent appointment"],
      insufficientHistory: false,
    });
  });

  it("leaves risk undefined when none was provided", () => {
    const view = buildDashboardViewFromWorkspace({ ...BASE_ARGS, appointments: [APPT_FIXTURE] });
    expect(view.appointments[0]?.risk).toBeUndefined();
  });

  it("shows the revenue tiles in the clinic's own currency", () => {
    const paymentGroups = [group("Paid", 10000), group("Unpaid", 2500)];

    const euro = buildDashboardViewFromWorkspace({ ...BASE_ARGS, appointments: [], paymentGroups });
    const pound = buildDashboardViewFromWorkspace({
      ...BASE_ARGS,
      business: { ...BASE_BUSINESS, currency: "GBP" },
      appointments: [],
      paymentGroups,
    });

    expect(euro.revenueSummary.monthToDateDisplay).toBe("€100");
    expect(pound.revenueSummary.monthToDateDisplay).toBe("£100");
  });
});
