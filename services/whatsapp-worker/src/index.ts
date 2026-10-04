import { timingSafeEqual } from "node:crypto";

import express, { type RequestHandler } from "express";

import { BRIDGE_HEADER, config } from "./config";
import { logger, scrubError } from "./logger";
import { prisma } from "./prisma";
import {
  classifySendError,
  createSendDeduper,
  IDEMPOTENCY_KEY_PATTERN,
  sendOutcomeResponse,
} from "./send-dedupe";
import { createPrismaSendKeyStore } from "./send-key-store";
import {
  bootstrapSessions,
  closeAllSessions,
  forceRestartSession,
  getStatus,
  sendText,
  startSession,
} from "./socket-manager";

/** Max send-body length. MUST mirror the app seam's cap
 * (src/lib/messaging/index.ts). Reject — never truncate — so the app's stored
 * body always equals what was actually sent. */
const MAX_SEND_BODY = 8000;

/**
 * Remembers keyed sends for a week, in Postgres (WhatsAppSendKey), so a retry —
 * the next hourly reminder run, a follow-up staff send again days later, a
 * request whose answer was lost — is answered from the record instead of being
 * sent again, even after a worker restart. The table must exist first (the app's
 * prisma/whatsapp-reliability-migration.sql): without it every keyed send is
 * refused as not sent. Fingerprints are keyed with the bridge secret, so
 * rotating it makes a repeat of a key from the past week read as a different
 * message (422, which the app treats as possibly delivered) — never a duplicate.
 */
const sendDeduper = createSendDeduper({
  store: createPrismaSendKeyStore(prisma, (error) =>
    logger.warn({ error: scrubError(error) }, "expired send keys couldn't be swept")
  ),
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  fingerprintSecret: config.bridgeSecret,
  onStoreError: (message, error) => logger.error({ error: scrubError(error) }, message),
});

function isAuthorized(headerValue: string | undefined): boolean {
  if (!headerValue) {
    return false;
  }
  const provided = Buffer.from(headerValue);
  const expected = Buffer.from(config.bridgeSecret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

const requireSecret: RequestHandler = (req, res, next) => {
  if (!isAuthorized(req.header(BRIDGE_HEADER))) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  next();
};

const app = express();
// Small body cap — these are tiny control/send payloads; reject oversized JSON.
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Start (or restart) a workspace's socket. The QR string arrives asynchronously;
// the app polls GET /status for it.
app.post("/pair", requireSecret, async (req, res) => {
  const businessId = String(req.body?.businessId ?? "").trim();
  const force = req.body?.force === true;
  if (!businessId) {
    res.status(400).json({ error: "businessId is required." });
    return;
  }
  try {
    if (force) {
      // "Link a different device": drop the current session + creds and start a
      // fresh QR even if a session is already connected.
      await forceRestartSession(businessId);
    } else {
      await startSession(businessId);
    }
    res.json({ ok: true, ...getStatus(businessId) });
  } catch (error) {
    logger.error({ businessId, error: scrubError(error) }, "pair failed");
    res.status(500).json({ error: "Failed to start session." });
  }
});

app.get("/status", requireSecret, (req, res) => {
  const businessId = String(req.query.businessId ?? "").trim();
  if (!businessId) {
    res.status(400).json({ error: "businessId is required." });
    return;
  }
  res.json(getStatus(businessId));
});

app.post("/send", requireSecret, async (req, res) => {
  const businessId = String(req.body?.businessId ?? "").trim();
  const to = String(req.body?.to ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  if (!businessId || !to || !body) {
    res.status(400).json({ error: "businessId, to, and body are required." });
    return;
  }
  // Reject (don't silently truncate) an over-limit body: the app records the
  // body it sent, so a truncated send would make conversation history show text
  // the patient never received. The app seam caps first; this is defense-in-depth.
  if (body.length > MAX_SEND_BODY) {
    res.status(400).json({ error: "Message body exceeds the limit." });
    return;
  }
  // `to` must be a bare digits-only E.164 number — defense-in-depth so a crafted
  // JID (group/broadcast suffix, etc.) can't reach the socket and redirect a
  // patient message somewhere it shouldn't go.
  if (!/^\d{6,15}$/.test(to)) {
    res.status(400).json({ error: "to must be a digits-only phone number." });
    return;
  }
  // Optional: a repeat of the same key never sends twice (see send-dedupe.ts).
  // Absent means the request behaves exactly as before keys existed.
  const rawKey: unknown = req.body?.idempotencyKey;
  if (
    rawKey !== undefined &&
    rawKey !== null &&
    (typeof rawKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(rawKey))
  ) {
    res.status(400).json({ error: "idempotencyKey is invalid." });
    return;
  }
  const idempotencyKey = typeof rawKey === "string" ? rawKey : undefined;

  const outcome = await sendDeduper.run(
    { businessId, key: idempotencyKey, to, body },
    async () => {
      try {
        return { kind: "sent", result: await sendText(businessId, to, body) };
      } catch (error) {
        logger.error({ businessId, error: scrubError(error) }, "send failed");
        return classifySendError(error);
      }
    }
  );
  if (outcome.kind === "key_conflict") {
    logger.warn({ businessId }, "send refused: idempotency key reused for a different message");
  }
  const response = sendOutcomeResponse(outcome);
  res.status(response.status).json(response.body);
});

// Backstops: a stray rejection/exception must not silently drop every tenant's
// socket. Log (record-ids only) and keep the process alive; the source-level
// guards in socket-manager handle the known cases.
process.on("unhandledRejection", (reason) => {
  logger.error({ error: scrubError(reason) }, "Unhandled promise rejection");
});
process.on("uncaughtException", (error) => {
  logger.error({ error: scrubError(error) }, "Uncaught exception");
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "WhatsApp worker listening");
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  closeAllSessions();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // Force-exit if a graceful close hangs (e.g. an open socket).
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Best-effort: reconnect every workspace that already has saved creds. A DB
// outage must not stop the HTTP bridge from coming up.
prisma.whatsAppSession
  .findMany({ select: { businessId: true } })
  .then((rows) => bootstrapSessions(rows.map((row) => row.businessId)))
  .catch((error) => {
    logger.error(
      { error: scrubError(error) },
      "Session bootstrap skipped (database unavailable)"
    );
  });
