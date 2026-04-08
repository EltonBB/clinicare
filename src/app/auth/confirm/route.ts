import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";

function isMobileVerification(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(userAgent);
}

function sanitizeNextPath(next?: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }

  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = sanitizeNextPath(searchParams.get("next"));

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");
  redirectTo.searchParams.delete("next");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      if (type === "recovery") {
        redirectTo.pathname = "/reset-password";
        redirectTo.searchParams.set("recovery", "1");
      } else if (type === "signup" || type === "email") {
        if (isMobileVerification(request)) {
          redirectTo.pathname = "/confirm-email";
          redirectTo.searchParams.set("verified", "1");
        } else {
          redirectTo.pathname = "/login";
          redirectTo.searchParams.set("verified", "1");
        }
      } else if (type === "email_change") {
        redirectTo.pathname = next === "/settings" ? "/settings" : "/dashboard";
        redirectTo.searchParams.set("email_updated", "1");
      } else {
        redirectTo.searchParams.set("verified", "1");
      }

      return NextResponse.redirect(redirectTo);
    }
  }

  const fallback = request.nextUrl.clone();
  if (type === "recovery") {
    fallback.pathname = "/forgot-password";
    fallback.searchParams.set(
      "expired",
      "1"
    );
  } else {
    fallback.pathname = "/confirm-email";
    fallback.searchParams.set(
      "error",
      "That verification link is no longer valid. Request a new one below."
    );
  }

  return NextResponse.redirect(fallback);
}
