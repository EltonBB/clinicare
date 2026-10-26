import { describe, expect, it, vi } from "vitest";

const updateMany = vi.hoisted(() => vi.fn(async () => ({ count: 2 })));
vi.mock("@/lib/prisma", () => ({ prisma: { business: { updateMany } } }));

import { endExpiredProTrials } from "./pro-trial-data";

describe("endExpiredProTrials", () => {
  it("returns only clinics whose started trial ran out, and that Paddle still bills for Basic", async () => {
    const now = new Date("2026-11-09T13:00:00Z");
    expect(await endExpiredProTrials(now)).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        billingMode: "SUBSCRIPTION",
        proTrialEndsAt: { lte: now },
        proTrialStartedAt: { not: null },
        plan: "PRO",
        subscribedPlan: "BASIC",
      },
      data: { plan: "BASIC" },
    });
  });
});
