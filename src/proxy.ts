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

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/mobile")) {
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
