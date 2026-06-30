import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { loadMobileMe } from "@/lib/mobile/me";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import {
  DEVICE_TOKEN_TTL_MS,
  MAX_CODE_ATTEMPTS,
  generateDeviceToken,
  hashAccessCode,
  hashDeviceToken,
} from "@/lib/staff-auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(1).max(64),
  deviceLabel: z.string().max(120).optional(),
  platform: z.enum(["ios", "android"]).optional(),
  expoPushToken: z.string().max(256).optional(),
});

const REDEEM_RATE_LIMIT = { limit: 8, windowMs: 60_000 };
// One generic message for every failure mode — never reveal whether a code
// exists, is expired, already used, or locked.
const GENERIC_INVALID =
  "That code is invalid or has expired. Ask your clinic admin for a new one.";

export async function POST(request: Request) {
  const ip = clientIpFromHeaders(request.headers);
  const rate = await checkRateLimit(`mobile-redeem:${ip}`, REDEEM_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const codeHash = hashAccessCode(parsed.data.code);
  const rawToken = generateDeviceToken();
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const code = await tx.staffAccessCode.findUnique({ where: { codeHash } });
      if (!code) {
        return { kind: "invalid" as const };
      }

      // Lazily expire an active-but-stale code.
      if (code.status === "ACTIVE" && code.expiresAt <= now) {
        await tx.staffAccessCode.update({
          where: { id: code.id },
          data: { status: "EXPIRED" },
        });
        return { kind: "invalid" as const };
      }

      // Wrong-state redemption (already used / revoked / expired): count the
      // attempt and lock the code past the threshold to bound brute force.
      if (code.status !== "ACTIVE") {
        const attemptCount = code.attemptCount + 1;
        const shouldLock =
          attemptCount >= MAX_CODE_ATTEMPTS && code.status !== "REDEEMED";
        await tx.staffAccessCode.update({
          where: { id: code.id },
          data: { attemptCount, ...(shouldLock ? { status: "REVOKED" } : {}) },
        });
        return { kind: "invalid" as const };
      }

      // Compare-and-swap consume: only one concurrent request can flip ACTIVE →
      // REDEEMED, so a code can never be redeemed twice (single-use race-safe).
      const consumed = await tx.staffAccessCode.updateMany({
        where: { id: code.id, status: "ACTIVE" },
        data: { status: "REDEEMED", redeemedAt: now },
      });
      if (consumed.count !== 1) {
        return { kind: "invalid" as const };
      }

      const device = await tx.staffDevice.create({
        data: {
          businessId: code.businessId,
          staffMemberId: code.staffMemberId,
          tokenHash: hashDeviceToken(rawToken),
          deviceLabel: parsed.data.deviceLabel ?? null,
          platform: parsed.data.platform ?? null,
          expoPushToken: parsed.data.expoPushToken ?? null,
          expiresAt: new Date(now.getTime() + DEVICE_TOKEN_TTL_MS),
        },
      });

      return { kind: "ok" as const, device };
    });

    if (result.kind === "invalid") {
      return NextResponse.json({ error: GENERIC_INVALID }, { status: 401 });
    }

    // The code is now consumed and the device created, so the session is valid.
    // Loading the profile must NOT be able to fail the redeem — otherwise a
    // transient error would burn a single-use code. Best-effort: return the
    // token always; the app can fetch /me separately if `me` is null.
    let me = null;
    try {
      me = await loadMobileMe(result.device);
    } catch (error) {
      logger.error("Loading mobile profile after redeem failed.", error, {
        deviceId: result.device.id,
      });
    }

    // The raw token is returned exactly once; only its hash is stored.
    return NextResponse.json({ token: rawToken, me }, { status: 200 });
  } catch (error) {
    logger.error("Mobile access code redemption failed.", error);
    return NextResponse.json(
      { error: "We couldn't sign you in right now. Please try again." },
      { status: 500 }
    );
  }
}
