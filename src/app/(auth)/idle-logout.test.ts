import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";

const signOut = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: vi.fn(), delete: vi.fn(), set: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { signOut } }) }));
vi.mock("@/lib/business", () => ({ ACTION_RATE_LIMIT_ERROR: "", isWithinActionBudget: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(), clientIpFromHeaders: () => "203.0.113.7" }));
vi.mock("@/lib/email-verification-receipts", () => ({
  createEmailVerificationReceipt: vi.fn(),
  markEmailVerificationReceiptVerifiedByEmail: vi.fn(),
}));

import { idleLogoutAction } from "./actions";

describe("idleLogoutAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ends only this browser's session, then goes to the login notice", async () => {
    signOut.mockResolvedValue({ error: null });
    await idleLogoutAction();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(redirect).toHaveBeenCalledWith("/login?idle=1");
  });

  it("fails without redirecting when the sign-out didn't go through", async () => {
    signOut.mockResolvedValue({ error: { message: "network" } });
    await expect(idleLogoutAction()).rejects.toThrow();
    expect(redirect).not.toHaveBeenCalled();
  });
});
