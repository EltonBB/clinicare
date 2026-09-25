const storageReferencePrefix = "supabase-storage://";

export const mediaBucket =
  process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET?.trim() || "clinic-media";

export type WorkspaceMediaFolder = "logos" | "client-gallery" | "client-documents";
export type WorkspaceImageFolder = Extract<
  WorkspaceMediaFolder,
  "logos" | "client-gallery"
>;

export type StorageReference = {
  bucket: string;
  path: string;
};

export function createStorageReference(bucket: string, path: string) {
  return `${storageReferencePrefix}${bucket}/${path}`;
}

export function parseStorageReference(value: string): StorageReference | null {
  const trimmed = value.trim();

  if (!trimmed.startsWith(storageReferencePrefix)) {
    return null;
  }

  const withoutPrefix = trimmed.slice(storageReferencePrefix.length);
  const separatorIndex = withoutPrefix.indexOf("/");

  if (separatorIndex <= 0 || separatorIndex === withoutPrefix.length - 1) {
    return null;
  }

  return {
    bucket: withoutPrefix.slice(0, separatorIndex),
    path: withoutPrefix.slice(separatorIndex + 1),
  };
}

export function parseSupabaseStorageUrl(
  value: string,
  expectedOwnerId: string,
  expectedFolder: WorkspaceMediaFolder
): StorageReference | null {
  try {
    const url = new URL(value.trim());
    const configuredUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (!configuredUrl.pathname.endsWith("/")) configuredUrl.pathname += "/";
    const storagePath = new URL("storage/v1/object/", configuredUrl).pathname;
    const localHttp =
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.origin !== configuredUrl.origin ||
      url.username ||
      url.password
    ) {
      return null;
    }

    if (!url.pathname.startsWith(storagePath)) {
      return null;
    }

    const parts = url.pathname.slice(storagePath.length).split("/");
    const accessType = parts[0];
    const bucket = parts[1];
    const pathParts = parts.slice(2);

    if (
      (accessType !== "public" && accessType !== "sign") ||
      bucket !== mediaBucket ||
      pathParts.length !== 3 ||
      pathParts.some((part) => !part)
    ) {
      return null;
    }

    const path = pathParts.map((part) => decodeURIComponent(part)).join("/");
    const [ownerId, folder] = path.split("/");
    return isValidUploadShape(bucket, path) &&
      ownerId === expectedOwnerId &&
      folder === expectedFolder
      ? { bucket, path }
      : null;
  } catch {
    return null;
  }
}

export function normalizeStorageReference(
  value: string,
  expectedOwnerId: string,
  expectedFolder: WorkspaceMediaFolder
): string | null {
  const existingReference = parseStorageReference(value);

  if (existingReference) {
    const [ownerId, folder] = existingReference.path.split("/");
    return isValidUploadShape(existingReference.bucket, existingReference.path) &&
      ownerId === expectedOwnerId &&
      folder === expectedFolder
      ? createStorageReference(existingReference.bucket, existingReference.path)
      : null;
  }

  const urlReference = parseSupabaseStorageUrl(value, expectedOwnerId, expectedFolder);

  if (urlReference) {
    return createStorageReference(urlReference.bucket, urlReference.path);
  }

  // A same-project Storage URL that failed the owner/folder/bucket checks
  // must not fall through as an ordinary HTTPS link with someone else's
  // signed token. This includes transformed-image routes and percent-encoded
  // paths whose decoding at a proxy/router could hide a Storage route.
  // Historical values remain untouched by the read path.
  try {
    const url = new URL(value.trim());
    const configuredUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (url.origin === configuredUrl.origin) {
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(url.pathname);
      } catch {
        return null;
      }
      if (
        decodedPath.includes("%") ||
        /(?:^|\/)storage\/v1\/(?:object|render\/image)(?:\/|$)/i.test(decodedPath)
      ) {
        return null;
      }
    }
  } catch {
    // Generic URL validation remains the caller's responsibility.
  }

  return value.trim();
}

export function isStorageReference(value: string) {
  return parseStorageReference(value) !== null;
}

/**
 * True when `bucket`+`path` have the exact shape every real upload produces
 * (media-storage-client.ts: `${ownerId}/${folder}/${uuid}.${ext}`) — the
 * configured media bucket, and exactly three path segments. Structural
 * plausibility only, not an ownership check: it says nothing about whose
 * ownerId the first segment actually is. Shared by safe-url.ts's input-side
 * validation (a value must at least look like a real upload before it's
 * accepted at all) and the storage-cleanup sweep's delete-side revalidation
 * (media-storage-server.ts, which layers its own ownerId-prefix match on
 * top) — kept as one function so the two never silently drift apart on what
 * "well-formed" means.
 */
export function isValidUploadShape(bucket: string, path: string): boolean {
  const segments = path.split("/");
  return bucket === mediaBucket && segments.length === 3 && segments.every(Boolean);
}
