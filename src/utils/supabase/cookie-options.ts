import type { CookieOptionsWithName } from "@supabase/ssr";

// @supabase/ssr leaves `secure` off its auth cookies by default, so a first
// plain-http request (before HSTS is cached) would carry the session. They
// stay readable by script (httpOnly off) because the browser client uploads
// media with the same session.
export const authCookieOptions: CookieOptionsWithName = {
  secure: process.env.NODE_ENV === "production",
};
