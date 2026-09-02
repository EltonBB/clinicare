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

export function parseSupabaseStorageUrl(value: string): StorageReference | null {
  try {
    const url = new URL(value.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    const objectIndex = parts.indexOf("object");

    if (objectIndex === -1) {
      return null;
    }

    const accessType = parts[objectIndex + 1];
    const bucket = parts[objectIndex + 2];
    const pathParts = parts.slice(objectIndex + 3);

    if (
      (accessType !== "public" && accessType !== "sign") ||
      !bucket ||
      pathParts.length === 0
    ) {
      return null;
    }

    return {
      bucket,
      path: pathParts.map((part) => decodeURIComponent(part)).join("/"),
    };
  } catch {
    return null;
  }
}

export function normalizeStorageReference(value: string) {
  const existingReference = parseStorageReference(value);

  if (existingReference) {
    return createStorageReference(existingReference.bucket, existingReference.path);
  }

  const urlReference = parseSupabaseStorageUrl(value);

  if (urlReference) {
    return createStorageReference(urlReference.bucket, urlReference.path);
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
  return bucket === mediaBucket && path.split("/").length === 3;
}
