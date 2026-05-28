import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAuthConfirmUrl,
  normalizeConfiguredAppUrl,
} from "../src/lib/app-url-policy.ts";
import {
  normalizeOptionalPublicUrl,
  normalizePublicUrl,
} from "../src/lib/safe-url.ts";

describe("safe-url", () => {
  it("accepts https URLs", () => {
    assert.equal(
      normalizePublicUrl(" https://example.com/file.pdf "),
      "https://example.com/file.pdf"
    );
  });

  it("accepts Supabase storage references", () => {
    assert.equal(
      normalizePublicUrl("supabase-storage://clinic-media/user/client-documents/a.pdf"),
      "supabase-storage://clinic-media/user/client-documents/a.pdf"
    );
  });

  it("rejects unsafe URL schemes and protocol-relative URLs", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "blob:https://example.com/id",
      "//evil.com/path",
    ]) {
      assert.throws(() => normalizePublicUrl(value), /safe HTTPS URL/);
      assert.equal(normalizeOptionalPublicUrl(value), "");
    }
  });
});

describe("app-url-policy", () => {
  it("fails loudly in production without APP_URL", () => {
    assert.throws(
      () =>
        normalizeConfiguredAppUrl({
          configuredUrl: "",
          nodeEnv: "production",
        }),
      /APP_URL/
    );
  });

  it("builds auth confirm URLs from the production APP_URL", () => {
    assert.equal(
      buildAuthConfirmUrl("https://clinicare-vela.space", "/reset-password").toString(),
      "https://clinicare-vela.space/auth/confirm?next=%2Freset-password"
    );
  });

  it("uses configured APP_URL instead of forwarded host values", () => {
    assert.equal(
      normalizeConfiguredAppUrl({
        configuredUrl: "https://clinicare-vela.space",
        nodeEnv: "production",
      }),
      "https://clinicare-vela.space"
    );
  });
});
