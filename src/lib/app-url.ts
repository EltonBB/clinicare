import { headers } from "next/headers";

import {
  buildAuthConfirmUrl,
  normalizeConfiguredAppUrl,
} from "@/lib/app-url-policy";

export async function getAppUrl() {
  const configuredRaw =
    process.env.APP_URL ??
    (process.env.NODE_ENV === "production"
      ? ""
      : process.env.NEXT_PUBLIC_APP_URL ?? "");
  const configuredUrl = normalizeConfiguredAppUrl({
    configuredUrl: configuredRaw,
  });

  if (configuredUrl) {
    return configuredUrl;
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
  return buildAuthConfirmUrl(baseUrl, nextPath).toString();
}
