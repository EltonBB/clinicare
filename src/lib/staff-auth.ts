import { createHash, randomBytes, randomInt } from "node:crypto";

import type { Business, StaffDevice, StaffMember } from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * Mobile-staff authentication seam — the device-token twin of
 * {@link import("@/lib/business").getAuthedBusiness}.
 *
 * Staff are a SECOND authenticated principal: they are NOT Supabase users.
 * A doctor enrolls a device with a one-time access code (issued by the admin in
 * the web app) and then authenticates every `/api/mobile/v1/*` request with a
 * device-bound, server-issued, revocable token. This module is the ONLY place
 * mobile requests are authenticated — the future audit-logging hook attaches at
 * {@link requireStaffContext} so every patient-data access is recorded in one
 * place (record IDs only — never PHI, per the logging rule).
 *
 * No JWT/crypto library is used (the repo has none): tokens and codes are
 * `node:crypto` primitives, mirroring `src/lib/cron-auth.ts`.
 */

/** Device session lifetime. Bumped on activity; absolute cap re-checked each request. */
export const DEVICE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Enrollment code lifetime — short, single-use. */
export const ACCESS_CODE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
/** Wrong-state redemption attempts on one code before it locks. */
export const MAX_CODE_ATTEMPTS = 5;

// Crockford base32 — excludes I, L, O, U to avoid visual/keyboard ambiguity.
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// ---- crypto helpers --------------------------------------------------------

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

// ---- request context -------------------------------------------------------

export type StaffContext = {
  staffMember: StaffMember;
  business: Business;
  device: StaffDevice;
};

export type StaffAuthError = { error: string; status: number };

/** Extract the bearer token from an Authorization header, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim();
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

/**
 * Authenticate a `/api/mobile/v1/*` request from its bearer device token.
 * Returns the resolved {@link StaffContext} or a typed error (discriminate with
 * `"error" in result`). Generic messages only — never leak why auth failed.
 *
 * Tenant + principal isolation: callers MUST scope every query by
 * `ctx.business.id`, and per-doctor data additionally by `ctx.staffMember.id`.
 */
export async function requireStaffContext(
  request: Request
): Promise<StaffContext | StaffAuthError> {
  const raw = bearerToken(request);
  if (!raw) {
    return { error: "Unauthorized.", status: 401 };
  }

  const device = await prisma.staffDevice.findUnique({
    where: { tokenHash: hashDeviceToken(raw) },
    include: { staffMember: true, business: true },
  });

  const now = new Date();
  const valid =
    device &&
    device.revokedAt === null &&
    device.expiresAt > now &&
    device.staffMember.isActive &&
    device.staffMember.status !== "INACTIVE";

  if (!device || !valid) {
    return { error: "Unauthorized.", status: 401 };
  }

  // Slide the session forward on activity. Best-effort: a write fault must not
  // fail an otherwise-valid read.
  try {
    await prisma.staffDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + DEVICE_TOKEN_TTL_MS) },
    });
  } catch (error) {
    logger.error("Failed to refresh staff device session.", error, {
      deviceId: device.id,
    });
  }

  // TODO(audit): record this mobile access (staffMemberId + accessed record id +
  // timestamp) here — the single choke point for the HIPAA audit-log hook.

  const { staffMember, business } = device;
  return { staffMember, business, device };
}
