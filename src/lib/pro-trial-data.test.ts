import { describe, expect, it, vi } from "vitest";

const updateMany = vi.hoisted(() => vi.fn(async () => ({ count: 2 })));
vi.mock("@/lib/prisma", () => ({ prisma: { business: { updateMany } } }));

import { endExpiredProTrials, scheduleProTrialOffers } from "./pro-trial-data";

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

describe("scheduleProTrialOffers", () => {
  const now = new Date("2026-11-09T13:00:00Z");
  const paysForBasic = {
    billingMode: "SUBSCRIPTION",
    subscriptionStatus: "ACTIVE",
    AND: [
      { OR: [{ subscribedPlan: "BASIC" }, { subscribedPlan: null, plan: "BASIC" }] },
      { OR: [{ cancelAt: null }, { cancelAt: { lte: now } }] },
    ],
  };

  it("restarts a clock that hasn't run out once the clinic stops paying for Basic, then starts new ones 30 days out", async () => {
    updateMany.mockClear();
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 3 });
    expect(await scheduleProTrialOffers(now)).toEqual({ opened: 3, reset: 1 });
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { proTrialStartedAt: null, proTrialOfferedAt: { gt: now }, NOT: paysForBasic },
      data: { proTrialOfferedAt: null },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { ...paysForBasic, proTrialStartedAt: null, proTrialOfferedAt: null },
      data: { proTrialOfferedAt: new Date("2026-12-09T13:00:00Z") },
    });
  });
});
