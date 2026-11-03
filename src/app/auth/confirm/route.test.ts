import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ set }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/email-verification-receipts", () => ({ markEmailVerificationReceiptVerifiedByEmail: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));

import { GET } from "./route";

const link = (query: string) => GET(new Request(`https://clinicare-vela.space/auth/confirm?${query}`));

describe("GET /auth/confirm", () => {
  beforeEach(() => set.mockClear());

  it("keeps the email's language for the pages after the link", async () => {
    await expect(link("next=/reset-password&token_hash=abc&type=recovery&lang=sq")).rejects.toThrow(
      "REDIRECT /reset-password/confirm"
    );
    expect(set).toHaveBeenCalledWith("vela_locale", "sq", expect.objectContaining({ path: "/", sameSite: "lax", secure: true }));
  });

  it("ignores a missing or unknown language", async () => {
    await expect(link("token_hash=abc&type=signup")).rejects.toThrow("REDIRECT");
    await expect(link("token_hash=abc&type=signup&lang=de")).rejects.toThrow("REDIRECT");
    expect(set).not.toHaveBeenCalled();
  });
});
