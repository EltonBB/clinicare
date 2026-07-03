import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/utils/supabase/middleware";

// The mobile API authenticates with device tokens, not browser cookies, so it
// skips the Supabase session/redirect middleware. Native clients aren't subject
// to CORS; the Expo *web* build (a different dev origin) is — so allow
// cross-origin requests and answer preflight here. Security is the bearer token,
// not the origin, so `*` is appropriate for this token-only API.
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// Exact-or-prefixed-with-slash so a future route sharing the "/api/mobile"
// prefix (e.g. "/api/mobile-admin") can't silently inherit wildcard CORS and
// skip the Supabase session middleware below.
function isMobileApiPath(pathname: string): boolean {
  return pathname === "/api/mobile" || pathname.startsWith("/api/mobile/");
}

export async function proxy(request: NextRequest) {
  if (isMobileApiPath(request.nextUrl.pathname)) {
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: corsHeaders() });
    }
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(corsHeaders())) {
      response.headers.set(key, value);
    }
    return response;
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
