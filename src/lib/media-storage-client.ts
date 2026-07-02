"use client";

import {
  createStorageReference,
  mediaBucket,
  parseStorageReference,
  type WorkspaceMediaFolder,
  type WorkspaceImageFolder,
} from "@/lib/media-storage";
import { createClient } from "@/utils/supabase/client";

const extensionByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const allowedImageTypes = new Set(Object.keys(extensionByMimeType));

const extensionByDocumentMimeType: Record<string, string> = {
  ...extensionByMimeType,
  "application/pdf": "pdf",
};

const allowedDocumentTypes = new Set(Object.keys(extensionByDocumentMimeType));

// Every message this module's upload/signing functions throw, below — kept in
// sync with those `throw new Error(...)` call sites deliberately, so callers
// can safely surface a caught error's message without ever risking a raw
// provider/network error (thrown by something other than this file, e.g. a
// Supabase SDK-level failure) reaching the UI verbatim.
const SAFE_UPLOAD_ERROR_MESSAGES = new Set([
  "Upload a JPG, PNG, WebP, or GIF image.",
  "This image is too large.",
  "Your session expired. Log in again to upload images.",
  "We couldn't upload this image. Try again.",
  "We couldn't prepare this image for preview. Try again.",
  "We couldn't load this image. Try again.",
  "Upload a PDF, JPG, PNG, WebP, or GIF file.",
  "This file is too large.",
  "Your session expired. Log in again to upload files.",
  "We couldn't upload this file. Try again.",
  "We couldn't prepare this file for preview. Try again.",
]);

/** A caught error's message if (and only if) it's one this module threw; otherwise `fallback`. */
export function safeUploadErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && SAFE_UPLOAD_ERROR_MESSAGES.has(error.message)) {
    return error.message;
  }
  return fallback;
}

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

function createMediaStoragePath(
  userId: string,
  folder: WorkspaceMediaFolder,
  file: File,
  extensions: Record<string, string>
) {
  const extension =
    extensions[file.type] ||
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "bin";
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
  if (!allowedImageTypes.has(file.type)) {
    throw new Error("Upload a JPG, PNG, WebP, or GIF image.");
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
    throw new Error("We couldn't upload this image. Try again.");
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(mediaBucket)
    .createSignedUrl(path, 60 * 60);

  if (signedUrlError) {
    throw new Error("We couldn't prepare this image for preview. Try again.");
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
    throw new Error("We couldn't load this image. Try again.");
  }

  return data.signedUrl;
}

export async function uploadWorkspaceDocument(
  file: File,
  options: {
    folder?: Extract<WorkspaceMediaFolder, "client-documents">;
    maxBytes: number;
  }
) {
  if (!allowedDocumentTypes.has(file.type)) {
    throw new Error("Upload a PDF, JPG, PNG, WebP, or GIF file.");
  }

  if (file.size > options.maxBytes) {
    throw new Error("This file is too large.");
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Your session expired. Log in again to upload files.");
  }

  const folder = options.folder ?? "client-documents";
  const path = createMediaStoragePath(
    user.id,
    folder,
    file,
    extensionByDocumentMimeType
  );
  const { error } = await supabase.storage.from(mediaBucket).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error("We couldn't upload this file. Try again.");
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(mediaBucket)
    .createSignedUrl(path, 60 * 60);

  if (signedUrlError) {
    throw new Error("We couldn't prepare this file for preview. Try again.");
  }

  return {
    storageUrl: createStorageReference(mediaBucket, path),
    signedUrl: data.signedUrl,
    fileSize: file.size,
    mimeType: file.type,
  };
}
