import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  checkRateLimit: vi.fn(),
  businessFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser, requireCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/prisma", () => ({ prisma: { business: { findFirst: mocks.businessFindFirst } } }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { ACTION_RATE_LIMIT_ERROR, getAuthedBusiness } from "./business";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "user_1", user_metadata: {} });
});

// 2026-10-06 QA: every server action behind getAuthedBusiness shares one
// per-user budget, so a script hammering any of them is cut off.
describe("getAuthedBusiness action budget", () => {
  it("refuses a user over the budget before touching the workspace", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 20 });

    await expect(getAuthedBusiness()).resolves.toEqual({ error: ACTION_RATE_LIMIT_ERROR });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("actions:user_1", { limit: 300, windowMs: 60_000 });
    expect(mocks.businessFindFirst).not.toHaveBeenCalled();
  });

  it("doesn't spend budget on a signed-out request", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const result = await getAuthedBusiness();

    expect(result).toEqual({ error: expect.stringContaining("session expired") });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });
});
