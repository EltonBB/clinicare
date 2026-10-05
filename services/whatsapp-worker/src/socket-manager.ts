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
import { prisma } from "./prisma";
import { SessionNotConnectedError, TimeoutError, type SentResult } from "./send-dedupe";
import { createPrismaSentMessageStore } from "./sent-message-store";

type SessionStatus = "connecting" | "qr" | "connected" | "disconnected";

type Session = {
  sock: WASocket;
  status: SessionStatus;
  qr?: string;
};

const sessions = new Map<string, Session>();
/** Businesses with an in-flight startSession — guards the Map against races. */
const starting = new Set<string>();
/**
 * Businesses with an in-flight forceRestartSession — covers the teardown
 * (old session removal, cred wipe) that happens before startSession is even
 * called, so it can't reuse `starting` itself (which startSession's own
 * guard treats as "already in progress, do nothing").
 */
const restarting = new Set<string>();
/** Consecutive reconnect attempts per business (reset on a successful open). */
const reconnectAttempts = new Map<string, number>();

const MAX_RECONNECT_ATTEMPTS = 10;
const SEND_TIMEOUT_MS = 20_000;
/** How long a send waits for its resend copy to be stored before answering. */
const KEEP_COPY_TIMEOUT_MS = 5_000;
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
/**
 * Whether this instance may hold sockets: off until bootstrapSessions (which
 * runs once the worker lease is held — see worker-lease.ts) and off again on
 * graceful shutdown, so no socket is started while another instance may hold
 * the account or after closeAllSessions.
 */
let active = false;
/**
 * Pairing requests that arrived before this instance held the lease (a deploy's
 * new instance is reachable a few seconds before it may connect), run once it
 * does: Settings only polls /status after its one /pair, so a dropped request
 * would never show a QR (Codex #134). `true` = a forced re-link.
 */
const pendingPairs = new Map<string, boolean>();
/** Saved sessions bootstrapSessions hasn't reached yet (it starts them in turn). */
const awaitingBootstrap = new Set<string>();
/**
 * Work still running against the WhatsApp account — sends, pairings (a forced
 * one wipes the stored creds), creds and logout writes — so shutdown can wait
 * for it before giving up the lease: the next instance must not connect, or
 * load creds, while this one may still send or rewrite them (Codex #134).
 */
let accountWorkInFlight = 0;
let onAccountWorkSettled: (() => void) | undefined;

async function trackAccountWork<T>(work: () => Promise<T>): Promise<T> {
  accountWorkInFlight += 1;
  try {
    return await work();
  } finally {
    accountWorkInFlight -= 1;
    if (accountWorkInFlight === 0) onAccountWorkSettled?.();
  }
}

/**
 * Resolves true once no account work is running (at once if none is), or false
 * after `timeoutMs`. Shutdown waits on it before releasing the lease.
 */
export function accountWorkSettled(timeoutMs: number): Promise<boolean> {
  if (accountWorkInFlight === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    onAccountWorkSettled = () => {
      clearTimeout(timer);
      onAccountWorkSettled = undefined;
      resolve(true);
    };
  });
}

/** Sent messages, kept for a week to answer a phone's resend request. */
const sentMessages = createPrismaSentMessageStore(prisma, {
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  onSweepError: (error) => logger.warn({ error: scrubError(error) }, "expired sent messages couldn't be swept"),
});

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
    // A non-logout close deletes the session and schedules an automatic
    // reconnect (see scheduleReconnect) for the whole backoff window before
    // the retry fires — reporting "disconnected" here would tell the app a
    // still-retrying attempt failed outright, causing Settings to stop
    // polling and hide the forthcoming QR mid-connect (Codex P2). A pending
    // reconnectTimers entry means a retry is actually coming; a confirmed
    // logout or exhausted-retries give-up always clears it first, so its
    // presence alone safely distinguishes "still retrying" from terminal.
    //
    // `starting` covers the other gap: startSession reserves this slot
    // synchronously (before reconnectTimers is even cleared, and well
    // before the socket — and so the session entry — actually exists) and
    // only releases it once the socket is created or startup fails. A slow
    // credential/version load (or a timed-out first-time /pair still inside
    // that same work) would otherwise report "disconnected" here too,
    // fresh evidence beyond the reconnect-timer gap above (Codex P2).
    //
    // `restarting` covers a third gap: forceRestartSession removes the old
    // session and wipes creds — including an awaited DB call — before it
    // ever calls startSession, so `starting` isn't set yet either during
    // that teardown. Without this, a forced "Link a different device" could
    // report "disconnected" mid-wipe, and the reconciliation above would
    // hide the fresh QR the worker produces moments later (Codex P2, fresh
    // evidence beyond the in-flight-startSession gap above).
    //
    // `!active` covers a fourth: a freshly deployed instance waiting for the old
    // one to let go of the lease starts nothing until it does, a few seconds —
    // a pairing asked for meanwhile is held in pendingPairs and runs then.
    return {
      status:
        !active ||
        pendingPairs.has(businessId) ||
        awaitingBootstrap.has(businessId) ||
        reconnectTimers.has(businessId) ||
        starting.has(businessId) ||
        restarting.has(businessId)
          ? "connecting"
          : "disconnected",
    };
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
  // No sockets before this instance holds the lease, nor once shutdown has
  // begun (a pending reconnect could fire during the graceful-close window).
  if (!active) {
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
    // Shutdown (or a lost lease) began while we were loading: the lease may
    // already be another instance's, so connecting now would overlap it.
    if (!active) {
      return;
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
      // Lets Baileys send a message again when the recipient's phone couldn't
      // decrypt it and asks for a resend; without it the request is ignored and
      // the patient sees "Waiting for this message" for good.
      getMessage: async (key) => {
        if (!key.id) return undefined;
        try {
          return await sentMessages.get(businessId, key.id);
        } catch (error) {
          logger.error({ businessId, error: scrubError(error) }, "Couldn't load a sent message to resend");
          return undefined;
        }
      },
    });

    sessions.set(businessId, { sock, status: "connecting" });

    // Persist creds — a DB blip here must never crash the (multi-tenant) process.
    sock.ev.on("creds.update", () => {
      trackAccountWork(saveCreds).catch((error) => {
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
      trackAccountWork(() => clearAuthState(businessId)).catch((error) => {
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
  if (!active) {
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
    if (!active) {
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
    // Record ids only. Shows whether WhatsApp's receipts reach the worker at all.
    logger.info({ businessId, providerMessageId: key.id, status }, "WhatsApp receipt");
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

/**
 * Sends a text message from a workspace's connected session. Whether a throw
 * means the message may have left is classifySendError's call: only a missing
 * session or a socket already closed before the write proves it didn't.
 */
export function sendText(businessId: string, to: string, body: string): Promise<SentResult> {
  return trackAccountWork(() => sendTextNow(businessId, to, body));
}

async function sendTextNow(
  businessId: string,
  to: string,
  body: string
): Promise<SentResult> {
  const session = sessions.get(businessId);
  if (!session || session.status !== "connected") {
    throw new SessionNotConnectedError("WhatsApp session is not connected.");
  }
  const jid = `${to}@s.whatsapp.net`;
  try {
    // Bound the send so a dead-but-not-yet-closed socket can't hang the request.
    const sent = await withTimeout(
      session.sock.sendMessage(jid, { text: body }),
      SEND_TIMEOUT_MS,
      "WhatsApp send timed out."
    );
    const providerMessageId = sent?.key?.id ?? null;
    if (providerMessageId && sent?.message) {
      // Stored before answering, so a worker that stops right after this send
      // still has the copy (Codex #134) — but briefly, and a failure is only
      // logged: the message has gone, and that must not read as unsent.
      try {
        await withTimeout(
          sentMessages.remember(businessId, providerMessageId, sent.message),
          KEEP_COPY_TIMEOUT_MS,
          "Keeping a copy of a sent message timed out."
        );
      } catch (error) {
        logger.error({ businessId, error: scrubError(error) }, "Couldn't keep a copy of a sent message");
      }
    }
    return { providerMessageId, status: "SENT" };
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
  active = false;
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
  // Not while another instance may still hold the account: wiping its creds
  // would unlink it mid-use. (pairSession holds a request until the lease is.)
  if (!active) {
    return;
  }
  // Reserve this slot for getStatus() before any teardown — the old session
  // is about to be removed and creds wiped (including an awaited DB call)
  // well before startSession itself ever sets `starting`, so without this
  // that whole window reported "disconnected" (Codex P2).
  restarting.add(businessId);
  try {
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
  } finally {
    restarting.delete(businessId);
  }
}

/**
 * Best-effort reconnect of every workspace that already has saved creds. Call
 * only once this instance holds the worker lease: it is what lets sockets start.
 */
export async function bootstrapSessions(
  businessIds: string[]
): Promise<void> {
  active = true;
  // Held pairings first: someone is waiting on Settings for their QR. Each
  // stays in pendingPairs (so getStatus keeps saying "connecting") until its
  // own start begins, which marks `starting`/`restarting` before any await
  // (Codex #134).
  const held = new Set(pendingPairs.keys());
  for (const businessId of businessIds) {
    if (!held.has(businessId)) awaitingBootstrap.add(businessId);
  }
  for (const [businessId, force] of [...pendingPairs]) {
    pendingPairs.delete(businessId);
    try {
      await pairSession(businessId, force);
    } catch (error) {
      logger.error({ businessId, error: scrubError(error) }, "Held pairing failed");
    }
  }
  for (const businessId of businessIds) {
    if (held.has(businessId)) {
      continue; // its held pairing above started it
    }
    awaitingBootstrap.delete(businessId);
    try {
      await trackAccountWork(() => startSession(businessId));
    } catch (error) {
      logger.error(
        { businessId, error: scrubError(error) },
        "Failed to bootstrap session"
      );
    }
  }
}

/**
 * POST /pair: start a workspace's session, or with `force` drop it and its
 * creds for a fresh QR ("link a different device"). Before this instance holds
 * the lease the request is held and runs once it does.
 */
export async function pairSession(businessId: string, force: boolean): Promise<void> {
  if (!active) {
    // Held pairings only run if this instance takes the lease; one shutting
    // down never does, so they simply go with it.
    pendingPairs.set(businessId, force || pendingPairs.get(businessId) === true);
    return;
  }
  await trackAccountWork(() => (force ? forceRestartSession(businessId) : startSession(businessId)));
}
