type NormalizeConfiguredAppUrlInput = {
  configuredUrl?: string | null;
  nodeEnv?: string;
};

function isProduction(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return nodeEnv === "production";
}

export function normalizeConfiguredAppUrl({
  configuredUrl,
  nodeEnv = process.env.NODE_ENV,
}: NormalizeConfiguredAppUrlInput) {
  const trimmed = configuredUrl?.trim().replace(/\/$/, "") ?? "";

  if (!trimmed) {
    if (isProduction(nodeEnv)) {
      throw new Error("APP_URL must be configured in production.");
    }

    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("APP_URL must be an absolute URL.");
  }

  if (isProduction(nodeEnv) && parsed.protocol !== "https:") {
    throw new Error("APP_URL must use https in production.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("APP_URL must use http or https.");
  }

  return parsed.toString().replace(/\/$/, "");
}

export function buildAuthConfirmUrl(baseUrl: string, nextPath: string) {
  const redirect = new URL("/auth/confirm", baseUrl);
  redirect.searchParams.set("next", nextPath);
  return redirect;
}
