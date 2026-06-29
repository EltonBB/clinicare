import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";
import { isOnboardingCompleted } from "@/lib/onboarding";

const supabaseUrl = getSupabaseUrl();
const supabaseKey = getSupabasePublishableKey();

const protectedPrefixes = [
  "/dashboard",
  "/calendar",
  "/clients",
  "/inbox",
  "/reports",
  "/settings",
  "/staff",
];

const authRoutes = ["/sign-up", "/login", "/confirm-email", "/forgot-password"];
const onboardingRoot = "/onboarding";

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value, cookie);
  });

  return target;
}

export async function updateSession(request: NextRequest) {
  if (request.nextUrl.pathname === "/auth/confirm") {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAuthRoute = authRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  const isOnboardingRoute =
    pathname === onboardingRoot || pathname.startsWith(`${onboardingRoot}/`);

  // Only the gated routes below need the session. Public/marketing pages don't
  // redirect on auth, and API routes (search, cron, webhooks) authenticate
  // themselves — so skip the Supabase auth round-trip for everything else. It
  // previously ran on every matched request, including RSC prefetches, adding
  // latency to public navigation and auth load at scale. Protected routes still
  // refresh the session here on the next navigation.
  if (!isProtected && !isAuthRoute && !isOnboardingRoute) {
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const onboardingCompleted = isOnboardingCompleted(user?.user_metadata);

  if (!user && (isProtected || isOnboardingRoute)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return copyCookies(response, NextResponse.redirect(redirectUrl));
  }

  if (user && !user.email_confirmed_at && (isProtected || isOnboardingRoute)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/confirm-email";
    if (user.email) {
      redirectUrl.searchParams.set("email", user.email);
    }
    redirectUrl.searchParams.set("pending", "1");
    return copyCookies(response, NextResponse.redirect(redirectUrl));
  }

  if (user?.email_confirmed_at && !onboardingCompleted && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/onboarding";
    return copyCookies(response, NextResponse.redirect(redirectUrl));
  }

  if (user?.email_confirmed_at && !onboardingCompleted && pathname === "/onboarding/complete") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/onboarding";
    return copyCookies(response, NextResponse.redirect(redirectUrl));
  }

  if (user?.email_confirmed_at && isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = onboardingCompleted ? "/dashboard" : "/onboarding";
    return copyCookies(response, NextResponse.redirect(redirectUrl));
  }

  return response;
}
