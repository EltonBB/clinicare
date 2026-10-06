import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  checkRateLimit: vi.fn(),
  businessFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser, requireCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/prisma", () => ({ prisma: { business: { findFirst: mocks.businessFindFirst, findUnique: mocks.businessFindFirst } } }));
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

    await expect(getAuthedBusiness()).resolves.toEqual({ error: ACTION_RATE_LIMIT_ERROR, throttled: true });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("actions:user_1", { limit: 300, windowMs: 60_000 });
    expect(mocks.businessFindFirst).not.toHaveBeenCalled();
  });

  // Codex #140: a read/seen acknowledgement is fired once and never retried.
  it("lets an acknowledgement through without spending the budget", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 20 });
    mocks.businessFindFirst.mockResolvedValue({ id: "biz_1" });

    const result = await getAuthedBusiness(undefined, { actionBudget: false });

    expect(result).not.toHaveProperty("error");
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it("doesn't spend budget on a signed-out request", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const result = await getAuthedBusiness();

    expect(result).toEqual({ error: expect.stringContaining("session expired") });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });
});
