import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} from "baileys";
import type {
  BaileysEventMap,
  WAMessage,
  WASocket,
} from "baileys";
import qrcode from "qrcode-terminal";

import { clearAuthState, usePostgresAuthState } from "./auth-state";
import { postToApp } from "./bridge";
import { logger } from "./logger";

type SessionStatus = "connecting" | "qr" | "connected" | "disconnected";

type Session = {
  sock: WASocket;
  status: SessionStatus;
  qr?: string;
};

const sessions = new Map<string, Session>();
/** Businesses with an in-flight startSession — guards the Map against races. */
const starting = new Set<string>();
/** Consecutive reconnect attempts per business (reset on a successful open). */
const reconnectAttempts = new Map<string, number>();

const MAX_RECONNECT_ATTEMPTS = 10;
const SEND_TIMEOUT_MS = 20_000;

export function getStatus(businessId: string): {
  status: SessionStatus;
  qr?: string;
} {
  const session = sessions.get(businessId);
  if (!session) {
    return { status: "disconnected" };
  }
  return {
    status: session.status,
    qr: session.status === "qr" ? session.qr : undefined,
  };
}

/**
 * Starts (or restarts) a workspace's WhatsApp socket. Idempotent: a session
 * already connected, connecting, or mid-start is left alone. Pairing is driven
 * by the `connection.update` QR string; the app polls {@link getStatus} for it.
 */
export async function startSession(businessId: string): Promise<void> {
  const current = sessions.get(businessId);
  if (
    current &&
    (current.status === "connected" || current.status === "connecting")
  ) {
    return;
  }
  // Reserve the slot synchronously (before any await) so two concurrent
  // starts — e.g. boot bootstrap racing a /pair call — can't both create a
  // socket and orphan one.
  if (starting.has(businessId)) {
    return;
  }
  starting.add(businessId);

  try {
    const { state, saveCreds } = await usePostgresAuthState(businessId);
    const { version } = await fetchLatestBaileysVersion();

    // Pin Baileys' own logger to warn — at debug/trace it logs JIDs (phone
    // numbers), which must never reach our logs (HIPAA). Independent of the
    // worker's LOG_LEVEL.
    const waLogger = logger.child({ scope: "baileys", businessId }, { level: "warn" });

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, waLogger),
      },
      logger: waLogger,
      markOnlineOnConnect: false,
    });

    sessions.set(businessId, { sock, status: "connecting" });

    // Persist creds — a DB blip here must never crash the (multi-tenant) process.
    sock.ev.on("creds.update", () => {
      saveCreds().catch((error) => {
        logger.error(
          { businessId, error: String(error) },
          "Failed to persist WhatsApp creds"
        );
      });
    });

    sock.ev.on("connection.update", (update) => {
      handleConnectionUpdate(businessId, update);
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") {
        return;
      }
      for (const message of messages) {
        handleInbound(businessId, message).catch((error) => {
          logger.error(
            { businessId, error: String(error) },
            "Inbound message handling failed"
          );
        });
      }
    });

    // Delivery / read receipts for our own outbound messages.
    sock.ev.on("messages.update", (updates) => {
      handleReceipts(businessId, updates).catch((error) => {
        logger.error(
          { businessId, error: String(error) },
          "Receipt handling failed"
        );
      });
    });
  } finally {
    starting.delete(businessId);
  }
}

function handleConnectionUpdate(
  businessId: string,
  update: BaileysEventMap["connection.update"]
): void {
  const session = sessions.get(businessId);
  if (!session) {
    return;
  }
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    session.status = "qr";
    session.qr = qr;
    // Only print a scannable QR to the terminal in local dev — NEVER in
    // production logs, where anyone with log access could scan it and link the
    // clinic's WhatsApp. The app fetches the QR via /status and shows it in the
    // Settings UI (the only authorized pairing surface).
    if (process.env.NODE_ENV !== "production") {
      qrcode.generate(qr, { small: true });
    }
    logger.info({ businessId }, "WhatsApp QR ready for pairing");
  }

  if (connection === "open") {
    session.status = "connected";
    session.qr = undefined;
    reconnectAttempts.delete(businessId);
    logger.info({ businessId }, "WhatsApp connected");
  }

  if (connection === "close") {
    const statusCode = (
      lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
    )?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    session.status = "disconnected";
    // Clean up the closing socket (keepalive timer, listeners) before dropping.
    try {
      session.sock.end(undefined);
    } catch {
      // already closed
    }
    sessions.delete(businessId);
    logger.warn({ businessId, statusCode }, "WhatsApp connection closed");

    if (loggedOut) {
      // The phone unlinked us — wipe creds so a fresh pair is required.
      reconnectAttempts.delete(businessId);
      clearAuthState(businessId).catch(() => {});
      return;
    }

    scheduleReconnect(businessId);
  }
}

/** Reconnect with capped exponential backoff + jitter (no tight loop). */
function scheduleReconnect(businessId: string): void {
  const attempts = (reconnectAttempts.get(businessId) ?? 0) + 1;
  if (attempts > MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts.delete(businessId);
    logger.error(
      { businessId },
      "Giving up reconnecting after repeated failures — re-pair required"
    );
    return;
  }
  reconnectAttempts.set(businessId, attempts);
  const base = Math.min(1000 * 2 ** (attempts - 1), 60_000);
  const delay = base + Math.floor(Math.random() * 1000);
  logger.warn(
    { businessId, attempts, delayMs: delay },
    "Scheduling WhatsApp reconnect"
  );
  setTimeout(() => {
    startSession(businessId).catch((error) => {
      logger.error({ businessId, error: String(error) }, "Reconnect failed");
    });
  }, delay);
}

async function handleReceipts(
  businessId: string,
  updates: BaileysEventMap["messages.update"]
): Promise<void> {
  for (const { key, update } of updates) {
    if (!key.fromMe || !key.id) {
      continue;
    }
    const status = mapReceiptStatus(update.status);
    if (!status) {
      continue;
    }
    await postToApp({
      type: "status",
      businessId,
      providerMessageId: key.id,
      status,
    });
  }
}

function mapReceiptStatus(
  status: proto.WebMessageInfo.Status | null | undefined
): "SENT" | "DELIVERED" | "READ" | "FAILED" | undefined {
  switch (status) {
    case proto.WebMessageInfo.Status.SERVER_ACK:
      return "SENT";
    case proto.WebMessageInfo.Status.DELIVERY_ACK:
      return "DELIVERED";
    case proto.WebMessageInfo.Status.READ:
    case proto.WebMessageInfo.Status.PLAYED:
      return "READ";
    case proto.WebMessageInfo.Status.ERROR:
      return "FAILED";
    default:
      return undefined;
  }
}

function extractText(message: WAMessage): string {
  const content = message.message;
  if (!content) {
    return "";
  }
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    ""
  ).trim();
}

async function handleInbound(
  businessId: string,
  message: WAMessage
): Promise<void> {
  if (message.key.fromMe) {
    return;
  }
  const remoteJid = message.key.remoteJid ?? "";
  // 1:1 conversations only — ignore groups, status broadcasts, newsletters.
  if (!remoteJid.endsWith("@s.whatsapp.net")) {
    return;
  }
  const from = remoteJid.split("@")[0] ?? "";
  const body = extractText(message);
  if (!from || !body) {
    return;
  }

  await postToApp({
    type: "message",
    businessId,
    from,
    body,
    providerMessageId: message.key.id ?? "",
    contactName: message.pushName ?? undefined,
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Sends a text message from a workspace's connected session. */
export async function sendText(
  businessId: string,
  to: string,
  body: string
): Promise<{ providerMessageId: string | null; status: "SENT" }> {
  const session = sessions.get(businessId);
  if (!session || session.status !== "connected") {
    throw new Error("WhatsApp session is not connected.");
  }
  const jid = `${to}@s.whatsapp.net`;
  // Bound the send so a dead-but-not-yet-closed socket can't hang the request.
  const sent = await withTimeout(
    session.sock.sendMessage(jid, { text: body }),
    SEND_TIMEOUT_MS,
    "WhatsApp send timed out."
  );
  return { providerMessageId: sent?.key?.id ?? null, status: "SENT" };
}

/** Best-effort reconnect of every workspace that already has saved creds. */
export async function bootstrapSessions(
  businessIds: string[]
): Promise<void> {
  for (const businessId of businessIds) {
    try {
      await startSession(businessId);
    } catch (error) {
      logger.error(
        { businessId, error: String(error) },
        "Failed to bootstrap session"
      );
    }
  }
}
