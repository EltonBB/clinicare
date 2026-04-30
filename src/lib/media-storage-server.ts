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

export async function deleteStorageReferences(
  values: Array<string | null | undefined>
) {
  const referencesByBucket = values.reduce<Map<string, Set<string>>>((result, value) => {
    if (!value) {
      return result;
    }

    const reference = parseStorageReference(value);

    if (!reference) {
      return result;
    }

    const paths = result.get(reference.bucket) ?? new Set<string>();
    paths.add(reference.path);
    result.set(reference.bucket, paths);
    return result;
  }, new Map<string, Set<string>>());

  if (referencesByBucket.size === 0) {
    return;
  }

  const supabase = await createClient();

  await Promise.all(
    Array.from(referencesByBucket.entries()).map(async ([bucket, paths]) => {
      const { error } = await supabase.storage.from(bucket).remove(Array.from(paths));

      if (error) {
        console.error("Failed to delete media objects.", {
          bucket,
          paths: Array.from(paths),
          message: error.message,
        });
      }
    })
  );
}
