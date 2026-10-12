import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: vi.fn(), delete: vi.fn(), set: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
}));
vi.mock("@/lib/business", () => ({
  ACTION_RATE_LIMIT_ERROR: "Too many requests right now.",
  isWithinActionBudget: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  clientIpFromHeaders: () => "203.0.113.7",
}));
vi.mock("@/lib/email-verification-receipts", () => ({
  createEmailVerificationReceipt: vi.fn(),
  markEmailVerificationReceiptVerifiedByEmail: vi.fn(),
}));

import { loginAction } from "./actions";

function form(email: string) {
  const data = new FormData();
  data.set("email", email);
  data.set("password", "Correct-horse-9");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials" } });
});

describe("loginAction per-account limit", () => {
  it("refuses once the account's budget is spent, even from a fresh IP", async () => {
    mocks.checkRateLimit.mockImplementation(async (key: string) => ({
      allowed: !key.startsWith("login-account:"),
    }));

    const result = await loginAction({} as never, form("owner@example.com"));

    expect(result).toMatchObject({ error: expect.stringMatching(/too many attempts/i) });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("keys the account by a hash that ignores case and never holds the address", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });

    await loginAction({} as never, form("Owner@Example.com"));
    await loginAction({} as never, form("owner@example.com"));

    const accountKeys = mocks.checkRateLimit.mock.calls
      .map(([key]) => key as string)
      .filter((key) => key.startsWith("login-account:"));
    expect(accountKeys).toHaveLength(2);
    expect(accountKeys[0]).toBe(accountKeys[1]);
    expect(accountKeys[0]).not.toContain("example.com");
  });
});
