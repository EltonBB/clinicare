"use client";

import {
  createStorageReference,
  mediaBucket,
  parseStorageReference,
  type WorkspaceImageFolder,
} from "@/lib/media-storage";
import { createClient } from "@/utils/supabase/client";

const extensionByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type UploadWorkspaceImageOptions = {
  folder: WorkspaceImageFolder;
  maxBytes: number;
};

function createStoragePath(userId: string, folder: WorkspaceImageFolder, file: File) {
  const extension =
    extensionByMimeType[file.type] ||
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "jpg";
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${userId}/${folder}/${id}.${extension}`;
}

export async function uploadWorkspaceImage(
  file: File,
  options: UploadWorkspaceImageOptions
) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Upload an image file.");
  }

  if (file.size > options.maxBytes) {
    throw new Error("This image is too large.");
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Your session expired. Log in again to upload images.");
  }

  const path = createStoragePath(user.id, options.folder, file);
  const { error } = await supabase.storage.from(mediaBucket).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(mediaBucket)
    .createSignedUrl(path, 60 * 60);

  if (signedUrlError) {
    throw new Error(signedUrlError.message);
  }

  return {
    storageUrl: createStorageReference(mediaBucket, path),
    signedUrl: data.signedUrl,
  };
}

export async function createSignedImageUrl(storageUrl: string) {
  const reference = parseStorageReference(storageUrl);

  if (!reference) {
    return storageUrl;
  }

  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(reference.bucket)
    .createSignedUrl(reference.path, 60 * 60);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}
