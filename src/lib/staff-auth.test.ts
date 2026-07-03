import { describe, expect, it } from "vitest";

import {
  bearerToken,
  generateAccessCode,
  generateDeviceToken,
  hashAccessCode,
  hashDeviceToken,
  normalizeCode,
  sha256Hex,
} from "@/lib/staff-auth-crypto";

describe("sha256Hex", () => {
  it("is deterministic and 64 hex chars", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
  });
});

describe("generateDeviceToken", () => {
  it("is a 256-bit base64url token, unique per call", () => {
    const a = generateDeviceToken();
    const b = generateDeviceToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
  });

  it("hashes deterministically", () => {
    const t = generateDeviceToken();
    expect(hashDeviceToken(t)).toBe(hashDeviceToken(t));
    expect(hashDeviceToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("generateAccessCode", () => {
  it("is XXXX-XXXX-XXXX of Crockford base32 (no I/L/O/U)", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateAccessCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it("yields ~60 bits of entropy worth of distinct values", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(generateAccessCode());
    expect(seen.size).toBe(200);
  });

  it("normalizes to exactly 12 alphabet chars (dashes stripped, stable under folding)", () => {
    const normalized = normalizeCode(generateAccessCode());
    expect(normalized).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
  });
});

describe("normalizeCode", () => {
  it("uppercases, folds O->0 and I/L->1, strips separators", () => {
    expect(normalizeCode("oil")).toBe("011");
    expect(normalizeCode("ab1c-d2ef 3gh4")).toBe("AB1CD2EF3GH4");
    expect(normalizeCode("  ab1c-d2ef-3gh4  ")).toBe("AB1CD2EF3GH4");
  });
});

describe("hashAccessCode", () => {
  it("is format-insensitive (dashes/case/ambiguous glyphs do not change the hash)", () => {
    const canonical = hashAccessCode("AB1C-D2EF-3GH4");
    expect(hashAccessCode("ab1cd2ef3gh4")).toBe(canonical);
    expect(hashAccessCode("ab1c d2ef 3gh4")).toBe(canonical);
  });

  it("folds ambiguous input to the same hash as the canonical glyphs", () => {
    // O/I/L typed by a user resolve to 0/1/1.
    expect(hashAccessCode("OIL0")).toBe(hashAccessCode("0110"));
  });
});

describe("bearerToken", () => {
  function req(headers: Record<string, string>) {
    return new Request("https://example.test/api/mobile/v1/me", { headers });
  }

  it("extracts the token, case-insensitively on the scheme", () => {
    expect(bearerToken(req({ authorization: "Bearer abc.def" }))).toBe("abc.def");
    expect(bearerToken(req({ authorization: "bearer abc" }))).toBe("abc");
  });

  it("returns null for missing or malformed headers", () => {
    expect(bearerToken(req({}))).toBeNull();
    expect(bearerToken(req({ authorization: "Basic abc" }))).toBeNull();
    expect(bearerToken(req({ authorization: "Bearer" }))).toBeNull();
  });
});
