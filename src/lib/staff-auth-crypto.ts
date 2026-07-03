import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Pure crypto/formatting helpers for the mobile-staff auth seam — split out of
 * staff-auth.ts (which re-exports all of these) so they can be unit-tested
 * without importing prisma.ts, whose module-level DATABASE_URL read throws in
 * any environment without a real DB configured (CI included — see ci.yml:
 * "Offline only — no DB or secrets needed"). No Prisma import belongs in this
 * file; if one is ever added, move the function to staff-auth.ts instead.
 */

// Crockford base32 — excludes I, L, O, U to avoid visual/keyboard ambiguity.
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** sha256 hex. Used to store/compare device tokens and access codes at rest. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Opaque 256-bit device token, returned to the device exactly once at redeem. */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceToken(rawToken: string): string {
  return sha256Hex(rawToken);
}

/**
 * High-entropy enrollment code: 12 Crockford-base32 chars (~60 bits), grouped
 * as `XXXX-XXXX-XXXX` for legibility. Typed once at enrollment; never reused.
 * `randomInt` is uniform (no modulo bias).
 */
export function generateAccessCode(): string {
  let chars = "";
  for (let i = 0; i < 12; i += 1) {
    chars += CROCKFORD_ALPHABET[randomInt(0, CROCKFORD_ALPHABET.length)];
  }
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/**
 * Canonicalize user-entered code: uppercase, fold the ambiguous glyphs Crockford
 * drops (O→0, I/L→1), then keep only alphabet chars (strips dashes/spaces). The
 * hash is computed over this canonical form so formatting never affects lookup.
 */
export function normalizeCode(input: string): string {
  const folded = input
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  let out = "";
  for (const ch of folded) {
    if (CROCKFORD_ALPHABET.includes(ch)) {
      out += ch;
    }
  }
  return out;
}

export function hashAccessCode(input: string): string {
  return sha256Hex(normalizeCode(input));
}

/** Extract the bearer token from an Authorization header, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim();
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}
