import { type NextRequest } from "next/server";

import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // `api/mobile` is exempt from the Supabase session/redirect middleware: the
    // mobile staff API authenticates with device tokens via requireStaffContext,
    // not browser cookies. Global security headers still apply (next.config.ts
    // sets them on "/:path*", independent of this matcher).
    "/((?!monitoring|api/mobile|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
