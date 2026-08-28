import { describe, expect, it } from "vitest";

import {
  HARD_RESPONSE_DEADLINE_MS,
  PER_BUSINESS_TIMEOUT_MS,
  REMINDER_RUN_BUDGET_MS,
} from "./reminder-timing";

describe("reminder cron timing", () => {
  /**
   * Regression test for the P1 Codex found: a business claimed right at the
   * soft run-budget edge, then running for the full per-business timeout,
   * must still settle with real headroom before the route's hard deadline —
   * otherwise the cursor-persist write after mapWithConcurrency (which only
   * runs once EVERY claimed business, including that straggler, has settled)
   * can be starved by the platform's 300s kill before it ever executes.
   */
  it("leaves real headroom after the worst-case business settles, before the hard deadline", () => {
    const worstCaseSettleAt = REMINDER_RUN_BUDGET_MS + PER_BUSINESS_TIMEOUT_MS;
    expect(worstCaseSettleAt).toBeLessThan(HARD_RESPONSE_DEADLINE_MS);

    // Not just "less than" — enough room for the cursor write itself to run.
    const headroomMs = HARD_RESPONSE_DEADLINE_MS - worstCaseSettleAt;
    expect(headroomMs).toBeGreaterThanOrEqual(10_000);
  });

  it("keeps a meaningful window for starting new businesses", () => {
    // A regression guard against the derivation collapsing the budget to
    // near-zero (or negative) if PER_BUSINESS_TIMEOUT_MS is ever raised
    // without revisiting this relationship.
    expect(REMINDER_RUN_BUDGET_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("stays comfortably under the 300s platform maxDuration even in the worst case", () => {
    const PLATFORM_MAX_DURATION_MS = 300_000;
    const worstCaseSettleAt = REMINDER_RUN_BUDGET_MS + PER_BUSINESS_TIMEOUT_MS;
    expect(worstCaseSettleAt).toBeLessThan(PLATFORM_MAX_DURATION_MS);
  });
});
