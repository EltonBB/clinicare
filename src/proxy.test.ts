import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSession = vi.hoisted(() => vi.fn());
vi.mock("@/utils/supabase/middleware", () => ({ updateSession }));

import { proxy } from "./proxy";

describe("mobile proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSession.mockResolvedValue(NextResponse.next());
  });

  it("prevents private mobile responses being stored and exposes the retry budget", async () => {
    const response = await proxy(new NextRequest("https://example.test/api/mobile/v1/me"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe("Retry-After");
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("answers mobile preflight without cookie auth", async () => {
    const response = await proxy(
      new NextRequest("https://example.test/api/mobile/v1/clock", { method: "OPTIONS" }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Authorization, Content-Type",
    );
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("does not give a sibling mobile-admin path token-only CORS", async () => {
    await proxy(new NextRequest("https://example.test/api/mobile-admin"));
    expect(updateSession).toHaveBeenCalledOnce();
  });
});

describe("content security policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSession.mockImplementation(async (request: NextRequest) =>
      NextResponse.next({ request: { headers: request.headers } }),
    );
  });

  it("gives every page a fresh nonce and hands the same policy to the page", async () => {
    const policies = [];
    for (const path of ["/clients/abc", "/clients/abc", "/", "/login", "/checkout"]) {
      const response = await proxy(new NextRequest(`https://example.test${path}`));
      const policy = response.headers.get("Content-Security-Policy") ?? "";
      expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
      expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      const forwarded: NextRequest = updateSession.mock.calls.at(-1)![0];
      expect(forwarded.headers.get("Content-Security-Policy")).toBe(policy);
      policies.push(policy);
    }
    expect(new Set(policies).size).toBe(policies.length);
  });

  it("keeps the policy on a sign-in redirect", async () => {
    updateSession.mockResolvedValue(NextResponse.redirect("https://example.test/login"));
    const response = await proxy(new NextRequest("https://example.test/dashboard"));
    expect(response.headers.get("Content-Security-Policy")).toContain("'strict-dynamic'");
  });
});
