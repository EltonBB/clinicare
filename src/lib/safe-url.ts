const storageReferencePrefix = "supabase-storage://";

function isDevelopmentLocalhost(url: URL) {
  return (
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1")
  );
}

function isValidStorageReference(value: string) {
  if (!value.startsWith(storageReferencePrefix)) {
    return false;
  }

  const withoutPrefix = value.slice(storageReferencePrefix.length);
  const separatorIndex = withoutPrefix.indexOf("/");

  return separatorIndex > 0 && separatorIndex < withoutPrefix.length - 1;
}

export function normalizePublicUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("//")) {
    throw new Error("Enter a safe HTTPS URL.");
  }

  if (isValidStorageReference(trimmed)) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a safe HTTPS URL.");
  }

  if (parsed.protocol === "https:" || isDevelopmentLocalhost(parsed)) {
    return parsed.toString();
  }

  throw new Error("Enter a safe HTTPS URL.");
}

export function normalizeOptionalPublicUrl(value: string | null | undefined) {
  if (!value?.trim()) {
    return "";
  }

  try {
    return normalizePublicUrl(value);
  } catch {
    return "";
  }
}

export function hasUnsafePublicUrl(value: string | null | undefined) {
  return Boolean(value?.trim()) && normalizeOptionalPublicUrl(value) === "";
}
