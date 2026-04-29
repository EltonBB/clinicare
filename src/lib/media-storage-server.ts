import { parseStorageReference } from "@/lib/media-storage";
import { createClient } from "@/utils/supabase/server";

const signedUrlTtlSeconds = 60 * 60;

export async function resolveMediaDisplayUrl(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const reference = parseStorageReference(value);

  if (!reference) {
    return value;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(reference.bucket)
    .createSignedUrl(reference.path, signedUrlTtlSeconds);

  if (error) {
    console.error("Failed to create signed media URL.", {
      bucket: reference.bucket,
      path: reference.path,
      message: error.message,
    });
    return "";
  }

  return data.signedUrl;
}
