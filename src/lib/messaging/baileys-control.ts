import { logger } from "@/lib/logger";

import {
  BAILEYS_BRIDGE_HEADER,
  type WorkerPairRequest,
  type WorkerStatusResponse,
} from "./baileys-contract";

/**
 * Control-plane client for the WhatsApp worker (pairing + status). The data
 * plane (sending messages) goes through the messaging seam's BaileysWhatsApp
 * adapter; this is the out-of-band path Settings uses to link a number.
 *
 * Returns `null` on any failure (unconfigured worker, network error, non-2xx)
 * so callers surface a generic, provider-neutral message instead of an error.
 */

type WorkerConfig = { workerUrl: string; secret: string };

// Per-request deadlines so a stalled worker/proxy can't tie up server-action
// invocations (Settings polls /status every 2.5s). /pair waits for the worker's
// startSession (which itself can spend ~10s on a version fetch), so it gets a
// longer budget than the instant /status read. A timeout throws → the existing
// catch returns null → callers surface a generic, retryable message.
const PAIR_TIMEOUT_MS = 15_000;
const STATUS_TIMEOUT_MS = 8_000;

function workerConfig(): WorkerConfig | null {
  const workerUrl = process.env.BAILEYS_WORKER_URL?.trim();
  const secret = process.env.BAILEYS_BRIDGE_SECRET?.trim();
  if (!workerUrl || !secret) {
    return null;
  }
  return { workerUrl: workerUrl.replace(/\/$/, ""), secret };
}

/** Whether a Baileys worker is configured for this environment. */
export function isBaileysWorkerConfigured(): boolean {
  return workerConfig() !== null;
}

/**
 * Start (or restart) a workspace's session. Returns the current state. Pass
 * `force` to drop the existing session + creds and emit a fresh QR even if
 * already connected ("link a different device").
 */
export async function requestBaileysPairing(
  businessId: string,
  options?: { force?: boolean }
): Promise<WorkerStatusResponse | null> {
  const config = workerConfig();
  if (!config) {
    return null;
  }
  const payload: WorkerPairRequest = {
    businessId,
    force: options?.force === true,
  };
  try {
    const response = await fetch(`${config.workerUrl}/pair`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [BAILEYS_BRIDGE_HEADER]: config.secret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(PAIR_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.error("WhatsApp worker pair request failed.", undefined, {
        businessId,
        status: response.status,
      });
      return null;
    }
    return (await response.json()) as WorkerStatusResponse;
  } catch (error) {
    logger.error("Could not reach WhatsApp worker for pairing.", error, {
      businessId,
    });
    return null;
  }
}

/** Poll a workspace's connection status (and QR, while pairing). */
export async function fetchBaileysStatus(
  businessId: string
): Promise<WorkerStatusResponse | null> {
  const config = workerConfig();
  if (!config) {
    return null;
  }
  try {
    const response = await fetch(
      `${config.workerUrl}/status?businessId=${encodeURIComponent(businessId)}`,
      {
        headers: { [BAILEYS_BRIDGE_HEADER]: config.secret },
        cache: "no-store",
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as WorkerStatusResponse;
  } catch (error) {
    logger.error("Could not reach WhatsApp worker for status.", error, {
      businessId,
    });
    return null;
  }
}
