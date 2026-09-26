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

  it("keeps an external HTTPS image link", () => {
    const externalUrl = ownUrl.replace("clinic.example", "other.example");
    expect(normalizeStorageReference(externalUrl, "owner", "logos")).toBe(externalUrl);
  });

  it.each([
    ownUrl.replace("/storage/v1/object/", "/other/storage/v1/object/"),
    ownUrl.replace(`/${mediaBucket}/`, "/other-bucket/"),
    ownUrl.replace("owner/logos/image.jpg", "owner/logos%2Fprivate/image.jpg"),
    ownUrl.replace("owner/logos/image.jpg", "other-owner/logos/image.jpg"),
    ownUrl.replace("owner/logos/image.jpg", "owner/client-gallery/image.jpg"),
    ownUrl.replace("owner/logos/image.jpg", "owner/logos//image.jpg"),
    ownUrl.replace("/storage/", "/%73torage/"),
    ownUrl.replace("/storage/", "/%2573torage/"),
    ownUrl.replace("/storage/v1/object/sign/", "/storage/v1/render/image/sign/"),
    ownUrl.replace("/storage/v1/object/sign/", "/storage/v1/render/image/sign/").replace("owner/logos/image.jpg", "other-owner/logos/image.jpg"),
    "https://clinic.example/%2573torage/v1/object/sign/clinic-media/other/logos/a%25ZZ.jpg",
  ])("rejects an unverified same-project Storage URL: %s", (url) => {
    expect(normalizeStorageReference(url, "owner", "logos")).toBeNull();
  });

  it("keeps an unrelated unencoded HTTPS path on a shared project origin", () => {
    const url = "https://clinic.example/images/public-logo.jpg";
    expect(normalizeStorageReference(url, "owner", "logos")).toBe(url);
  });

  it("keeps an unrelated HTTPS path with an encoded space", () => {
    const url = "https://clinic.example/images/My%20Logo.jpg";
    expect(normalizeStorageReference(url, "owner", "logos")).toBe(url);
  });

  it("keeps an unrelated HTTPS path with an encoded literal percent", () => {
    const url = "https://clinic.example/images/Discount%25.jpg";
    expect(normalizeStorageReference(url, "owner", "logos")).toBe(url);
  });

  it("keeps an unrelated HTTPS path with a malformed percent escape", () => {
    const url = "https://clinic.example/images/Discount%ZZ.jpg";
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
      expect(normalizeStorageReference(ownUrl, "owner", "logos")).toBeNull();
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://clinic.example";
    }
  });
});
