import type { Business, StaffDevice, StaffMember } from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { bearerToken, hashDeviceToken } from "@/lib/staff-auth-crypto";

// Re-exported for existing callers (e.g. the redeem route) — the actual
// implementations live in staff-auth-crypto.ts, which has no Prisma import so
// its pure functions stay unit-testable without a DATABASE_URL (see that
// file's docstring). Do not re-implement these here.
export {
  bearerToken,
  generateAccessCode,
  generateDeviceToken,
  hashAccessCode,
  hashDeviceToken,
  normalizeCode,
  sha256Hex,
} from "@/lib/staff-auth-crypto";

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

/** Device session idle lifetime — slides forward on activity, capped by DEVICE_ABSOLUTE_TTL_MS. */
export const DEVICE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/**
 * Absolute device session lifetime from enrollment, regardless of activity —
 * without this, a device used at least once every 30 days would slide forever
 * and never require re-enrollment even if it were lost/stolen and later used
 * once. Forces periodic re-enrollment via a fresh admin-issued code.
 */
export const DEVICE_ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
/** Only bump lastSeenAt/expiresAt when the session is at least this stale — a
 *  DB write on literally every request (polling included) is unnecessary. */
const SESSION_REFRESH_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
/** Enrollment code lifetime — short, single-use. */
export const ACCESS_CODE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
/** Wrong-state redemption attempts on one code before it locks. */
export const MAX_CODE_ATTEMPTS = 5;

// ---- request context -------------------------------------------------------

export type StaffContext = {
  staffMember: StaffMember;
  business: Business;
  device: StaffDevice;
};

export type StaffAuthError = { error: string; status: number };

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
  // Pre-auth, IP-scoped — an invalid/garbage bearer token must not get an
  // unbounded number of DB lookups. This sits IN FRONT OF the per-device,
  // per-endpoint limits below (20-90/min each), so it must clear their sum,
  // not just one of them: several devices sharing a clinic's NAT/WiFi, each
  // hitting a few endpoints on a foreground refetch, land well into the
  // hundreds/min in normal use. Sized to still bound genuine abuse (nowhere
  // near "unbounded") without throttling legitimate multi-device bursts.
  const ip = clientIpFromHeaders(request.headers);
  const throttled = await checkRateLimit(`mobile-auth:${ip}`, { limit: 600, windowMs: 60_000 });
  if (!throttled.allowed) {
    return { error: "Too many requests. Please slow down for a moment.", status: 429 };
  }

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
    now.getTime() - device.createdAt.getTime() <= DEVICE_ABSOLUTE_TTL_MS &&
    device.staffMember.isActive &&
    device.staffMember.status !== "INACTIVE";

  if (!device || !valid) {
    return { error: "Unauthorized.", status: 401 };
  }

  // Slide the session forward on activity, but only when it's meaningfully
  // stale — every request (polling included) writing to the DB is wasteful.
  // Best-effort: a write fault must not fail an otherwise-valid read.
  if (now.getTime() - device.lastSeenAt.getTime() > SESSION_REFRESH_THRESHOLD_MS) {
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
  }

  // TODO(audit): record this mobile access (staffMemberId + accessed record id +
  // timestamp) here — the single choke point for the HIPAA audit-log hook.

  const { staffMember, business } = device;
  return { staffMember, business, device };
}
