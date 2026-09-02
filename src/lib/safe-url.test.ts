import { describe, expect, it } from "vitest";

import { normalizeOptionalPublicUrl, normalizePublicUrl } from "@/lib/safe-url";

describe("normalizePublicUrl", () => {
  it("accepts https URLs", () => {
    expect(normalizePublicUrl(" https://example.com/file.pdf ")).toBe(
      "https://example.com/file.pdf"
    );
  });

  it("accepts Supabase storage references", () => {
    expect(
      normalizePublicUrl("supabase-storage://clinic-media/user/client-documents/a.pdf")
    ).toBe("supabase-storage://clinic-media/user/client-documents/a.pdf");
  });

  it("rejects unsafe URL schemes and protocol-relative URLs", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "blob:https://example.com/id",
      "//evil.com/path",
    ]) {
      expect(() => normalizePublicUrl(value)).toThrow(/safe HTTPS URL/);
      expect(normalizeOptionalPublicUrl(value)).toBe("");
    }
  });

  // Regression coverage for the actual gap Codex + a peer session traced:
  // a supabase-storage://-shaped value used to skip the HTTPS-only check
  // entirely with zero validation of the bucket or path — meaning arbitrary,
  // never-uploaded content (including PHI, if that's what someone put there)
  // could reach a document/gallery/logo/receipt field just by wearing the
  // right prefix. It has to keep accepting a REAL storage reference (the test
  // above) while rejecting anything that doesn't actually look like one.
  it("rejects a storage-reference-shaped value whose bucket isn't the real configured bucket", () => {
    for (const value of [
      "supabase-storage://not-a-real-bucket/user/client-documents/a.pdf",
      "supabase-storage://Jane Doe Has Diabetes/x/y.pdf",
    ]) {
      expect(() => normalizePublicUrl(value)).toThrow(/safe HTTPS URL/);
      expect(normalizeOptionalPublicUrl(value)).toBe("");
    }
  });

  it("rejects a storage-reference-shaped value whose path doesn't have the real 3-segment upload shape", () => {
    for (const value of [
      // 2 segments (missing the folder) and 4 (an extra nested segment) —
      // every real upload is exactly userId/folder/uuid.ext.
      "supabase-storage://clinic-media/user/a.pdf",
      "supabase-storage://clinic-media/user/client-documents/nested/a.pdf",
    ]) {
      expect(() => normalizePublicUrl(value)).toThrow(/safe HTTPS URL/);
      expect(normalizeOptionalPublicUrl(value)).toBe("");
    }
  });
});
