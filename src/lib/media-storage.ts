const storageReferencePrefix = "supabase-storage://";

export const mediaBucket =
  process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET?.trim() || "clinic-media";

export type WorkspaceImageFolder = "logos" | "client-gallery";

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

export function isEmbeddedImageUrl(value: string) {
  return value.trim().startsWith("data:");
}
