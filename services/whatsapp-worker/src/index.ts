import { timingSafeEqual } from "node:crypto";

import express, { type RequestHandler } from "express";

import { BRIDGE_HEADER, config } from "./config";
import { logger } from "./logger";
import { prisma } from "./prisma";
import {
  bootstrapSessions,
  closeAllSessions,
  getStatus,
  sendText,
  startSession,
} from "./socket-manager";

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
  if (!businessId) {
    res.status(400).json({ error: "businessId is required." });
    return;
  }
  try {
    await startSession(businessId);
    res.json({ ok: true, ...getStatus(businessId) });
  } catch (error) {
    logger.error({ businessId, error: String(error) }, "pair failed");
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
  const body = String(req.body?.body ?? "").trim().slice(0, 8000);
  if (!businessId || !to || !body) {
    res.status(400).json({ error: "businessId, to, and body are required." });
    return;
  }
  // `to` must be a bare digits-only E.164 number — defense-in-depth so a crafted
  // JID (group/broadcast suffix, etc.) can't reach the socket and redirect a
  // patient message somewhere it shouldn't go.
  if (!/^\d{6,15}$/.test(to)) {
    res.status(400).json({ error: "to must be a digits-only phone number." });
    return;
  }
  try {
    const result = await sendText(businessId, to, body);
    res.json(result);
  } catch (error) {
    logger.error({ businessId, error: String(error) }, "send failed");
    res.status(502).json({ error: "Send failed." });
  }
});

// Backstops: a stray rejection/exception must not silently drop every tenant's
// socket. Log (record-ids only) and keep the process alive; the source-level
// guards in socket-manager handle the known cases.
process.on("unhandledRejection", (reason) => {
  logger.error({ error: String(reason) }, "Unhandled promise rejection");
});
process.on("uncaughtException", (error) => {
  logger.error({ error: String(error) }, "Uncaught exception");
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
      { error: String(error) },
      "Session bootstrap skipped (database unavailable)"
    );
  });
