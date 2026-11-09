import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof that a clinic the owner made free chose to pay (owner decision,
 * 2026-11-09: a free clinic upgrades like everyone else and becomes a normal
 * paying clinic). The checkout's custom data comes from the browser, so the
 * webhook sync refuses any subscription naming a free clinic (else anyone could
 * attach one to someone else's free clinic, cancel it and lock that clinic).
 * The checkout page, rendered for the clinic's signed-in owner, adds this
 * server-signed stamp; the sync converts the clinic only when it verifies.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Flat strings: Paddle custom data only carries text values. */
export type FreeUpgradeStamp = { freeUpgradeAt: string; freeUpgradeSig: string };

function sign(secret: string, businessId: string, at: string): string {
  return createHmac("sha256", secret).update(`vela-free-upgrade:${businessId}:${at}`).digest("hex");
}

export function freeUpgradeStamp(secret: string, businessId: string, now: Date = new Date()): FreeUpgradeStamp {
  const at = String(now.getTime());
  return { freeUpgradeAt: at, freeUpgradeSig: sign(secret, businessId, at) };
}

/** Whether the custom data carries this clinic's own stamp, made in the last day. */
export function hasValidFreeUpgradeStamp(
  secret: string,
  businessId: string,
  customData: Record<string, unknown> | null,
  now: Date = new Date()
): boolean {
  const at = customData?.freeUpgradeAt;
  const sig = customData?.freeUpgradeSig;
  if (typeof at !== "string" || typeof sig !== "string") return false;
  const age = now.getTime() - Number(at);
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return false;
  const expected = Buffer.from(sign(secret, businessId, at), "hex");
  const given = Buffer.from(sig, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
