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
});
