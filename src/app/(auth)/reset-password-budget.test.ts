import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  cookieGet: vi.fn(),
  isWithinActionBudget: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, delete: vi.fn(), set: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser, updateUser: mocks.updateUser, signOut: mocks.signOut },
  }),
}));
vi.mock("@/lib/business", () => ({
  ACTION_RATE_LIMIT_ERROR: "Too many requests right now.",
  isWithinActionBudget: mocks.isWithinActionBudget,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(), clientIpFromHeaders: vi.fn() }));
vi.mock("@/lib/email-verification-receipts", () => ({
  createEmailVerificationReceipt: vi.fn(),
  markEmailVerificationReceiptVerifiedByEmail: vi.fn(),
}));

import { resetPasswordAction } from "./actions";

function form() {
  const data = new FormData();
  data.set("password", "Correct-horse-9");
  data.set("confirmPassword", "Correct-horse-9");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user_1" } }, error: null });
  mocks.cookieGet.mockReturnValue({ value: "user_1" });
  mocks.updateUser.mockResolvedValue({ error: null });
});

// Codex #140: a recovery session is a signed-in user, so the password write
// spends the same per-user action budget as every other signed-in action.
describe("resetPasswordAction action budget", () => {
  it("refuses an over-budget reset before changing the password", async () => {
    mocks.isWithinActionBudget.mockResolvedValue(false);

    const result = await resetPasswordAction({} as never, form());

    expect(result).toMatchObject({ error: "Too many requests right now." });
    expect(mocks.isWithinActionBudget).toHaveBeenCalledWith("user_1");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("changes the password within the budget", async () => {
    mocks.isWithinActionBudget.mockResolvedValue(true);

    await resetPasswordAction({} as never, form());

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "Correct-horse-9" });
  });
});
