import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mediaBucket, normalizeStorageReference } from "@/lib/media-storage";

const previousProjectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const objectPath = "owner/logos/image.jpg";
const ownUrl = `https://clinic.example/storage/v1/object/sign/${mediaBucket}/${objectPath}?token=temporary`;

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://clinic.example";
});

afterAll(() => {
  if (previousProjectUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousProjectUrl;
});

describe("storage URL provenance", () => {
  it("converts a URL from the configured Supabase project", () => {
    expect(normalizeStorageReference(ownUrl, "owner", "logos")).toBe(
      `supabase-storage://${mediaBucket}/${objectPath}`
    );
  });

  it("accepts only direct references in the expected clinic folder", () => {
    const valid = `supabase-storage://${mediaBucket}/${objectPath}`;
    expect(normalizeStorageReference(valid, "owner", "logos")).toBe(valid);
    expect(normalizeStorageReference(valid, "other-owner", "logos")).toBeNull();
    expect(normalizeStorageReference(valid, "owner", "client-gallery")).toBeNull();
    expect(normalizeStorageReference(`supabase-storage://${mediaBucket}/owner/logos/`, "owner", "logos")).toBeNull();
  });

  it.each([
    ownUrl.replace("clinic.example", "other.example"),
    ownUrl.replace("/storage/v1/object/", "/other/storage/v1/object/"),
    ownUrl.replace(`/${mediaBucket}/`, "/other-bucket/"),
    ownUrl.replace("owner/logos/image.jpg", "owner/logos%2Fprivate/image.jpg"),
    ownUrl.replace("owner/logos/image.jpg", "other-owner/logos/image.jpg"),
    ownUrl.replace("owner/logos/image.jpg", "owner/client-gallery/image.jpg"),
    ownUrl.replace("owner/logos/image.jpg", "owner/logos//image.jpg"),
  ])("keeps an unverified URL as an external link: %s", (url) => {
    expect(normalizeStorageReference(url, "owner", "logos")).toBe(url);
  });

  it("honors a configured Supabase base path", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://clinic.example/supabase";
    try {
      const nestedUrl = ownUrl.replace(
        "/storage/v1/object/", "/supabase/storage/v1/object/"
      );
      expect(normalizeStorageReference(nestedUrl, "owner", "logos")).toBe(
        `supabase-storage://${mediaBucket}/${objectPath}`
      );
      expect(normalizeStorageReference(ownUrl, "owner", "logos")).toBe(ownUrl);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://clinic.example";
    }
  });
});
