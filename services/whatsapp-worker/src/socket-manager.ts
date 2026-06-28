import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidUser,
  isLidUser,
  jidDecode,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  proto,
} from "baileys";
import type {
  BaileysEventMap,
  WAMessage,
  WAMessageKey,
  WASocket,
  WAVersion,
} from "baileys";
import qrcode from "qrcode-terminal";

import { clearAuthState, usePostgresAuthState } from "./auth-state";
import { postToApp } from "./bridge";
import { logger, scrubError } from "./logger";

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
const STABLE_CONNECTION_MS = 15_000;
const VERSION_FETCH_TIMEOUT_MS = 10_000;
/** Pending "connection has been stable, reset the backoff" timers per business. */
const stableTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Pending reconnect timers per business — at most one in flight per tenant. */
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
/**
 * Per-business start "generation". A force re-pair bumps it so an in-flight
 * startSession (which may have loaded the OLD creds before the wipe) detects the
 * change after its awaits and restarts with the fresh creds instead of bringing
 * the old session back up.
 */
const sessionEpoch = new Map<string, number>();
/** Set on graceful shutdown so no new socket is started after closeAllSessions. */
let stopped = false;

/** Marks a {@link withTimeout} rejection so callers can react to a hang. */
class TimeoutError extends Error {}

function clearStableTimer(businessId: string): void {
  const timer = stableTimers.get(businessId);
  if (timer) {
    clearTimeout(timer);
    stableTimers.delete(businessId);
  }
}

function clearReconnectTimer(businessId: string): void {
  const timer = reconnectTimers.get(businessId);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(businessId);
  }
}

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
  // No new sockets once shutdown has begun (a pending reconnect could fire
  // during the graceful-close window).
  if (stopped) {
    return;
  }
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
  // Snapshot the generation so we can detect a force re-pair that lands while
  // we're loading creds/version below.
  const epoch = sessionEpoch.get(businessId) ?? 0;

  try {
    // A prior socket (status 'qr' or 'disconnected') is about to be replaced —
    // end it first so we don't leak its WebSocket / keepalive timer / listeners.
    const previous = sessions.get(businessId);
    if (previous) {
      try {
        previous.sock.end(undefined);
      } catch {
        // already closed
      }
      sessions.delete(businessId);
    }

    const { state, saveCreds } = await usePostgresAuthState(businessId);
    // Don't let a hung version fetch (Baileys' axios GET has no timeout) strand
    // this businessId in the `starting` set forever — fall back to the bundled
    // version on timeout/failure.
    let version: WAVersion | undefined;
    try {
      ({ version } = await withTimeout(
        fetchLatestBaileysVersion(),
        VERSION_FETCH_TIMEOUT_MS,
        "Baileys version fetch timed out."
      ));
    } catch (error) {
      logger.warn(
        { businessId, error: scrubError(error) },
        "Using bundled Baileys version (latest-version fetch failed)"
      );
    }

    // A force re-pair wiped creds while we were loading — abandon this start
    // (no socket exists yet) and restart so the FRESH creds are used instead of
    // bringing the old session back up. Release the slot first so the re-run can
    // re-acquire it (synchronous, so nothing else can interleave).
    if ((sessionEpoch.get(businessId) ?? 0) !== epoch) {
      starting.delete(businessId);
      return await startSession(businessId);
    }

    // Pin Baileys' own logger to warn — at debug/trace it logs JIDs (phone
    // numbers), which must never reach our logs (HIPAA). Independent of the
    // worker's LOG_LEVEL.
    const waLogger = logger.child({ scope: "baileys", businessId }, { level: "warn" });

    const sock = makeWASocket({
      ...(version ? { version } : {}),
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
          { businessId, error: scrubError(error) },
          "Failed to persist WhatsApp creds"
        );
      });
    });

    sock.ev.on("connection.update", (update) => {
      handleConnectionUpdate(businessId, sock, update);
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") {
        return;
      }
      for (const message of messages) {
        handleInbound(businessId, message).catch((error) => {
          logger.error(
            { businessId, error: scrubError(error) },
            "Inbound message handling failed"
          );
        });
      }
    });

    // Delivery / read receipts for our own outbound messages.
    sock.ev.on("messages.update", (updates) => {
      handleReceipts(businessId, updates).catch((error) => {
        logger.error(
          { businessId, error: scrubError(error) },
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
  sock: WASocket,
  update: BaileysEventMap["connection.update"]
): void {
  const session = sessions.get(businessId);
  // Ignore events from a socket that's already been superseded (a restart/
  // re-pair replaced it) — a stale close/open must not mutate or delete the new
  // active session.
  if (!session || session.sock !== sock) {
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
    // A pending reconnect is now moot — cancel it so it can't replace this live
    // socket and orphan it.
    clearReconnectTimer(businessId);
    // Reset the backoff counter only after the connection proves STABLE — a
    // socket that opens then immediately closes (e.g. a 515 restart) must not
    // zero the counter each cycle, or the cap could never be reached and a
    // flapping connection would hot-loop.
    clearStableTimer(businessId);
    stableTimers.set(
      businessId,
      setTimeout(() => {
        reconnectAttempts.delete(businessId);
        stableTimers.delete(businessId);
      }, STABLE_CONNECTION_MS)
    );
    logger.info({ businessId }, "WhatsApp connected");
    // Tell the app the link is live so it persists CONNECTED + enables reminders
    // without depending on the Settings poll catching this exact moment.
    void postToApp({ type: "connection", businessId, status: "connected" });
  }

  if (connection === "close") {
    const statusCode = (
      lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
    )?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    session.status = "disconnected";
    clearStableTimer(businessId);
    // Clean up the closing socket (keepalive timer, listeners) before dropping.
    try {
      session.sock.end(undefined);
    } catch {
      // already closed
    }
    sessions.delete(businessId);
    logger.warn({ businessId, statusCode }, "WhatsApp connection closed");

    if (loggedOut) {
      // The phone unlinked us — wipe creds so a fresh pair is required. Log a
      // wipe failure (don't swallow it): stale logged-out creds would make the
      // next pair immediately log out again, an invisible re-pair loop.
      reconnectAttempts.delete(businessId);
      clearReconnectTimer(businessId);
      clearAuthState(businessId).catch((error) => {
        logger.error(
          { businessId, error: scrubError(error) },
          "Failed to clear auth state after logout"
        );
      });
      // The phone unlinked us — tell the app so Settings shows disconnected and
      // the reminder cron stops attempting sends against a session that's gone.
      void postToApp({ type: "connection", businessId, status: "disconnected" });
      return;
    }

    scheduleReconnect(businessId);
  }
}

/** Reconnect with capped exponential backoff + jitter (no tight loop). */
function scheduleReconnect(businessId: string): void {
  if (stopped) {
    return;
  }
  const attempts = (reconnectAttempts.get(businessId) ?? 0) + 1;
  if (attempts > MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts.delete(businessId);
    logger.error(
      { businessId },
      "Giving up reconnecting after repeated failures — re-pair required"
    );
    // The connection is down for good (until a re-pair) — tell the app so it
    // stops showing CONNECTED and the cron stops attempting sends.
    void postToApp({ type: "connection", businessId, status: "disconnected" });
    return;
  }
  reconnectAttempts.set(businessId, attempts);
  const base = Math.min(1000 * 2 ** (attempts - 1), 60_000);
  const delay = base + Math.floor(Math.random() * 1000);
  logger.warn(
    { businessId, attempts, delayMs: delay },
    "Scheduling WhatsApp reconnect"
  );
  // At most one reconnect timer per business — a flap (close while a reconnect
  // is already pending) must not stack parallel reconnect chains.
  clearReconnectTimer(businessId);
  const timer = setTimeout(() => {
    reconnectTimers.delete(businessId);
    if (stopped) {
      return;
    }
    startSession(businessId).catch((error) => {
      // startSession threw before a socket existed (e.g. a DB blip loading auth
      // state) — re-arm so a transient failure doesn't permanently abandon the
      // session. This still respects MAX_RECONNECT_ATTEMPTS.
      logger.error({ businessId, error: scrubError(error) }, "Reconnect failed");
      scheduleReconnect(businessId);
    });
  }, delay);
  reconnectTimers.set(businessId, timer);
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
  // normalizeMessageContent (Baileys' own helper) unwraps the wrapper types
  // WhatsApp nests real content inside — disappearing (ephemeral), view-once,
  // and document-with-caption — so a reply wrapped in any of them isn't read as
  // empty and silently dropped.
  const content = normalizeMessageContent(message.message);
  if (!content) {
    return "";
  }
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    // Tapped replies (quick-reply buttons, list selections, template buttons)
    // carry the chosen label here instead of in `conversation`.
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    ""
  ).trim();
}

/**
 * Resolves the sender's phone number (digits only) for a 1:1 patient DM, or null
 * if this isn't a message we can thread by phone.
 *
 * WhatsApp is migrating chats to LID addressing: `remoteJid` arrives as
 * `<id>@lid` instead of the phone JID `<phone>@s.whatsapp.net`. A LID is NOT a
 * phone number, so the real number is read from `key.senderPn`. Groups, status
 * broadcasts, and newsletters resolve to null and are ignored. The previous
 * `endsWith("@s.whatsapp.net")` filter silently dropped every LID-addressed
 * reply — the cause of "I can send but never receive replies".
 */
function resolveSenderPhone(key: WAMessageKey): string | null {
  const remoteJid = key.remoteJid ?? "";
  // Phone-addressed 1:1 chat — the number is the JID user part.
  if (isJidUser(remoteJid)) {
    return jidDecode(remoteJid)?.user ?? null;
  }
  // LID-addressed 1:1 chat — the real phone lives in senderPn.
  if (isLidUser(remoteJid)) {
    const pn = key.senderPn;
    if (pn && isJidUser(pn)) {
      return jidDecode(pn)?.user ?? null;
    }
    return null;
  }
  // Group / broadcast / newsletter / anything else — not a patient DM.
  return null;
}

async function handleInbound(
  businessId: string,
  message: WAMessage
): Promise<void> {
  if (message.key.fromMe) {
    return;
  }
  const from = resolveSenderPhone(message.key);
  if (!from) {
    // A LID 1:1 chat we couldn't map to a phone means a real reply is being
    // dropped — surface it (record-id only, never the JID/number → HIPAA).
    // Groups / broadcasts / newsletters are expected and stay silent.
    if (isLidUser(message.key.remoteJid ?? "")) {
      logger.warn(
        { businessId },
        "Dropped LID inbound — no senderPn to resolve the phone number"
      );
    }
    return;
  }
  const body = extractText(message);
  if (!body) {
    // Media-only / unsupported content — nothing to thread as a text message.
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
    const timer = setTimeout(() => reject(new TimeoutError(message)), ms);
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
  try {
    // Bound the send so a dead-but-not-yet-closed socket can't hang the request.
    const sent = await withTimeout(
      session.sock.sendMessage(jid, { text: body }),
      SEND_TIMEOUT_MS,
      "WhatsApp send timed out."
    );
    return { providerMessageId: sent?.key?.id ?? null, status: "SENT" };
  } catch (error) {
    if (error instanceof TimeoutError) {
      // A timeout means the socket is almost certainly dead-but-not-closed —
      // tear it down and reconnect so it stops accepting sends, instead of
      // hanging every future request for the full timeout. (The close handler
      // no-ops since the session is already removed.)
      sessions.delete(businessId);
      try {
        session.sock.end(undefined);
      } catch {
        // already closed
      }
      scheduleReconnect(businessId);
    }
    throw error;
  }
}

/** End every live socket and cancel all timers (called on graceful shutdown). */
export function closeAllSessions(): void {
  // Block any further starts/reconnects, then cancel pending timers so a
  // reconnect can't spawn a new socket during the shutdown drain window.
  stopped = true;
  for (const timer of reconnectTimers.values()) {
    clearTimeout(timer);
  }
  reconnectTimers.clear();
  for (const timer of stableTimers.values()) {
    clearTimeout(timer);
  }
  stableTimers.clear();
  for (const session of sessions.values()) {
    try {
      session.sock.end(undefined);
    } catch {
      // already closed
    }
  }
  sessions.clear();
}

/**
 * Drop a workspace's current session AND stored creds, then start a fresh
 * pairing — used when the operator links a *different* device. Without wiping
 * creds, an already-connected session would just re-report "connected" and never
 * produce a new QR.
 */
export async function forceRestartSession(businessId: string): Promise<void> {
  // Bump the generation FIRST so any in-flight startSession (which may have
  // already loaded the soon-to-be-wiped creds) detects the change and restarts
  // with fresh creds rather than reviving the old session.
  sessionEpoch.set(businessId, (sessionEpoch.get(businessId) ?? 0) + 1);
  const existing = sessions.get(businessId);
  if (existing) {
    try {
      existing.sock.end(undefined);
    } catch {
      // already closed
    }
    sessions.delete(businessId);
  }
  clearReconnectTimer(businessId);
  clearStableTimer(businessId);
  reconnectAttempts.delete(businessId);
  // Wipe stored creds so the next connect requires a fresh QR scan instead of
  // silently re-linking the old phone. (The superseded socket's late close is a
  // no-op — handleConnectionUpdate's socket-identity guard drops it.)
  await clearAuthState(businessId);
  await startSession(businessId);
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
        { businessId, error: scrubError(error) },
        "Failed to bootstrap session"
      );
    }
  }
}
