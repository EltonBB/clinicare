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

export function isStorageReference(value: string) {
  return parseStorageReference(value) !== null;
}

export function isEmbeddedImageUrl(value: string) {
  return value.trim().startsWith("data:");
}
