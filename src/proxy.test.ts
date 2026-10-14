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
