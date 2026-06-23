import { describe, expect, it } from "vitest";

import {
  buildRevenueSummary,
  buildVisitsSummary,
  type DashboardPaymentStatusGroup,
} from "@/lib/dashboard";

function group(
  status: string,
  amountCents: number | null,
  count: number
): DashboardPaymentStatusGroup {
  return { status, _sum: { amountCents }, _count: { _all: count } };
}

describe("buildRevenueSummary", () => {
  it("sums paid revenue and outstanding from per-status groups", () => {
    const summary = buildRevenueSummary([
      group("Paid", 10000, 2),
      group("Unpaid", 5000, 1),
      group("Partially Paid", 3000, 1),
      group("Refunded", 2000, 1),
    ]);

    expect(summary.monthToDateDisplay).toBe("$100"); // dashboard money is whole-dollar
    expect(summary.paidCountThisMonth).toBe(2);
    expect(summary.outstandingDisplay).toBe("$80"); // 5000 + 3000 cents
    expect(summary.hasOutstanding).toBe(true);
    expect(summary.hasPayments).toBe(true);
  });

  it("treats no payment groups as an empty month", () => {
    const summary = buildRevenueSummary([]);

    expect(summary.monthToDateDisplay).toBe("$0");
    expect(summary.paidCountThisMonth).toBe(0);
    expect(summary.outstandingDisplay).toBe("$0");
    expect(summary.hasOutstanding).toBe(false);
    expect(summary.hasPayments).toBe(false);
  });

  it("ignores Refunded in both paid and outstanding totals (matches prior behavior)", () => {
    const summary = buildRevenueSummary([group("Refunded", 9999, 3)]);

    expect(summary.monthToDateDisplay).toBe("$0");
    expect(summary.outstandingDisplay).toBe("$0");
    expect(summary.hasPayments).toBe(true); // rows exist, just neither paid nor outstanding
  });

  it("tolerates a null sum (no rows in a status bucket)", () => {
    const summary = buildRevenueSummary([group("Paid", null, 0)]);

    expect(summary.monthToDateDisplay).toBe("$0");
    expect(summary.hasPayments).toBe(false);
  });
});

describe("buildVisitsSummary", () => {
  // Fixed reference day; UTC zone keeps day keys == calendar dates.
  const now = new Date("2026-06-23T12:00:00.000Z");

  it("splits the window into last-7 bars, prior-7, and 30-day totals", () => {
    const summary = buildVisitsSummary({
      now,
      timeZone: "UTC",
      allTime: 100,
      visitCountsByDay: [
        { key: "2026-06-23", count: 3 }, // offset 0 (today, in last 7)
        { key: "2026-06-22", count: 2 }, // offset 1 (last 7)
        { key: "2026-06-17", count: 1 }, // offset 6 (last 7)
        { key: "2026-06-16", count: 5 }, // offset 7 (prior 7)
        { key: "2026-06-10", count: 4 }, // offset 13 (prior 7)
        { key: "2026-05-01", count: 9 }, // outside 14 days, still in 30-day total
      ],
    });

    expect(summary.days).toHaveLength(7);
    expect(summary.days.at(-1)?.isToday).toBe(true);
    expect(summary.lastSevenDays).toBe(6); // 3 + 2 + 1
    expect(summary.previousSevenDays).toBe(9); // 5 + 4
    expect(summary.lastThirtyDays).toBe(24); // sum of all buckets
    expect(summary.allTime).toBe(100);
    expect(summary.deltaLabel).toBe("-33% vs prior week"); // round((6-9)/9*100)
    expect(summary.deltaTone).toBe("down");
  });

  it("reports a null delta when the prior week had no visits", () => {
    const summary = buildVisitsSummary({
      now,
      timeZone: "UTC",
      allTime: 0,
      visitCountsByDay: [{ key: "2026-06-23", count: 2 }],
    });

    expect(summary.lastSevenDays).toBe(2);
    expect(summary.previousSevenDays).toBe(0);
    expect(summary.deltaLabel).toBeNull();
    expect(summary.deltaTone).toBe("neutral");
  });
});
