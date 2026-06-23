import { describe, expect, it } from "vitest";

import { buildRevenueSummary, type DashboardPaymentStatusGroup } from "@/lib/dashboard";

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
