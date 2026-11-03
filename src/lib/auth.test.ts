import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const getSession = vi.fn();
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { getSession } }) }));

import { getSessionSignedInAt } from "./auth";

const token = (claims: object) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
const user = { last_sign_in_at: "2026-11-03T10:00:00Z" } as User;

describe("getSessionSignedInAt", () => {
  beforeEach(() => getSession.mockReset());

  it("reads this session's sign-in time from the token's amr", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: token({ amr: [{ method: "password", timestamp: 1_790_000_000 }] }) } },
    });
    expect(await getSessionSignedInAt(user)).toBe(1_790_000_000_000);
  });

  it("falls back to the account's last sign-in without a usable token", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: token({ amr: ["password"] }) } } });
    expect(await getSessionSignedInAt(user)).toBe(Date.parse("2026-11-03T10:00:00Z"));
    getSession.mockResolvedValue({ data: { session: { access_token: "not-a-jwt" } } });
    expect(await getSessionSignedInAt(user)).toBe(Date.parse("2026-11-03T10:00:00Z"));
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await getSessionSignedInAt({} as User)).toBe(0);
  });
});
