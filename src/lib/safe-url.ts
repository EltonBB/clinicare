import { isValidUploadShape } from "@/lib/media-storage";

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

/**
 * This is the actual safety boundary every caller in this file relies on for
 * a `supabase-storage://` value — normalizePublicUrl's storage-reference fast
 * path exists deliberately (an already-uploaded file's reference needs to
 * round-trip through these functions without the HTTPS-only check rejecting
 * it), so this can't just require HTTPS. It used to only check the prefix
 * shape (bucket+path both non-empty), which meant ANY value shaped like
 * `supabase-storage://<anything>/<anything>` — an arbitrary bucket name, an
 * arbitrary path — skipped the HTTPS requirement entirely with zero content
 * validation (Codex + peer-verified, found via the storage-cleanup sweep's
 * PHI-redaction fix: a value that never came from a real upload could still
 * reach a document/gallery/logo field this way). Now also requires
 * isValidUploadShape — the same bucket+3-segment check the sweep uses to
 * revalidate at delete time — so only a value that's at least structurally
 * plausible as a real upload gets treated as safe. Deliberately NOT an
 * ownership check (whether the first path segment matches the current
 * caller's own id): that's a different concern, and the sweep already
 * re-verifies it at the one point it actually matters (before deleting) —
 * building it in here too would mean solving the same problem at two layers
 * and threading caller identity through every one of this file's callers
 * for a check that wouldn't add any real protection over what the sweep
 * already does.
 */
function isValidStorageReference(value: string) {
  if (!value.startsWith(storageReferencePrefix)) {
    return false;
  }

  const withoutPrefix = value.slice(storageReferencePrefix.length);
  const separatorIndex = withoutPrefix.indexOf("/");

  if (separatorIndex <= 0 || separatorIndex >= withoutPrefix.length - 1) {
    return false;
  }

  const bucket = withoutPrefix.slice(0, separatorIndex);
  const path = withoutPrefix.slice(separatorIndex + 1);

  return isValidUploadShape(bucket, path);
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
