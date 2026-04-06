import { headers } from "next/headers";

export async function getAppUrl() {
  const configuredUrl =
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const headerStore = await headers();
  const proto =
    headerStore.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";

  return `${proto}://${host}`;
}

export async function buildAuthRedirectUrl(nextPath: string) {
  const baseUrl = await getAppUrl();
  const redirect = new URL("/auth/confirm", baseUrl);
  redirect.searchParams.set("next", nextPath);
  return redirect.toString();
}
