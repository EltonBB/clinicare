# Vela WhatsApp worker

The isolated **Baileys** WhatsApp service for the pilot. Baileys holds a
persistent WebSocket to WhatsApp's Linked-Devices protocol, so it **cannot run
on Vercel** (stateless, time-bounded functions). This worker is the long-running
process that owns that socket; the Next.js app talks to it over an HTTP bridge.

> **Pilot scope:** Kosovo-only, **non-PHI**, disposable. Baileys is an unofficial
> WhatsApp library and carries account-suspension risk — never use it for the
> US/PHI channel. The official, BAA-gated WhatsApp upgrade is a separate adapter
> behind the same messaging seam.

## Architecture

```
Next.js app (Vercel)                    WhatsApp worker (this service)
  sendMessage("WHATSAPP", …)              POST /send   → Baileys socket
   → BaileysWhatsAppAdapter  ──HTTP──▶    GET  /status → pairing/connection state
                                          POST /pair   → start session, emit QR
  /api/webhooks/whatsapp/baileys ◀─HTTP── inbound msg / delivery receipt
                                          auth state ⇄ Postgres (WhatsAppSession*)
```

App → worker calls (`/pair`, `/status`, `/send`) authenticate with a shared
secret (`BAILEYS_BRIDGE_SECRET`) in the `x-vela-bridge-secret` header
(constant-time compared). Worker → app events (the inbound webhook) carry
their own HMAC instead: `x-vela-webhook-timestamp` + `x-vela-webhook-signature`
(`v1=` HMAC-SHA256 over `timestamp.rawBody`, five-minute window), keyed with a
**separate** secret (`APP_WEBHOOK_SECRET` on the worker, `BAILEYS_WEBHOOK_SECRET`
on the app) — the worker names the `businessId` of every event it posts, so a
leaked bridge secret alone must not be enough to forge one. During rollout the
worker still also sends the shared `x-vela-bridge-secret` header on webhook
posts, and the app accepts it as a fallback only while `BAILEYS_WEBHOOK_SECRET`
is unset (see `DEPLOY.md`). The worker is trusted infra inside the boundary, so
it names the `businessId` directly.

## Endpoints

| Method | Path | Body / Query | Purpose |
|---|---|---|---|
| GET | `/health` | — | Liveness (no auth) |
| POST | `/pair` | `{ businessId }` | Start a session; QR arrives async via `/status` |
| GET | `/status` | `?businessId=` | `{ status, qr? }` — poll for the QR / connection |
| POST | `/send` | `{ businessId, to, body, idempotencyKey? }` | Send text; `to` is digits-only E.164 |

All except `/health` require the `x-vela-bridge-secret` header.

`/send` answers 200 when sent; 502 with `code: "send_failed"` when nothing was
sent (no connected session, or the socket was already closed — safe to retry);
409 when the message may have left (a timeout, or any other error from the
send, which may come after the frame was written). With an `idempotencyKey`, a repeat of the key within a week never
sends twice: a sent one is replayed (same 200), a timed-out one answers 409
again, a running one waits for the first attempt, and a different message under
the same key gets 422. Keys are recorded in Postgres (`WhatsAppSendKey`) before
the message is sent, so this survives a restart: an attempt the worker never
settled answers 409. Every `/send` answer carries `x-vela-send-keys: durable`, which
tells the app it may retry a keyed send whose answer it lost. See
`src/send-dedupe.ts` and `src/send-key-store.ts`; the
table comes from the app's `prisma/whatsapp-reliability-migration.sql`, which
must be applied before this worker version runs.

A copy of each sent message is kept for a week (`WhatsAppSentMessage`,
`src/sent-message-store.ts`) and handed to Baileys as `getMessage`: when the
recipient's phone can't decrypt a message it asks for it again, and without the
copy that request was ignored and the patient saw "Waiting for this message"
for good.

## One instance at a time

Only the instance holding the `WhatsAppWorkerLease` row connects to WhatsApp
(`src/worker-lease.ts`). A deploy starts the new instance while the old one still
runs; two sockets on one account knock each other off (WhatsApp's 440,
"replaced") and both move its encryption keys on, so phones can't decrypt what
either sends. The new instance answers `/health` straight away but connects
nothing until the old one releases the lease on shutdown (or it runs out, 30s
after the last renewal); an instance that can't renew in time exits, and its
restart waits like any other. Until it holds the lease, `/status` reports
`connecting`, `/send` answers `send_failed`, and a `/pair` is held and runs as
soon as it does. Copies of sent messages are a hard week: never handed back
once expired, and deleted hourly whether or not anything is sent. Both tables
come from the app's `prisma/whatsapp-resend-and-lease-migration.sql`, applied
before this worker version runs.

## Run locally

```bash
cd services/whatsapp-worker
npm install
cp .env.example .env        # fill in BAILEYS_BRIDGE_SECRET, APP_WEBHOOK_URL, APP_WEBHOOK_SECRET, DATABASE_URL
npm run typecheck           # tsc --noEmit
npm run dev                 # tsx watch src/index.ts
```

Then, with the Next.js app running and the same `BAILEYS_BRIDGE_SECRET` set in
its env plus `BAILEYS_WORKER_URL=http://localhost:8081`:

1. `POST /pair` with `{ "businessId": "<your business id>" }`.
2. Scan the QR printed in the worker terminal (or rendered from `/status`) with
   **WhatsApp → Linked devices** on the pilot phone.
3. `/status` flips to `connected`; inbound messages now POST to the app webhook
   and `sendMessage("WHATSAPP", …)` routes here.

## Database

The worker reads/writes only its own tables: `WhatsAppSession` and
`WhatsAppSessionKey` (non-PHI WhatsApp link credentials), `WhatsAppSendKey`,
`WhatsAppSentMessage` and `WhatsAppWorkerLease`. It is **self-contained**: it carries
a minimal `prisma/schema.prisma` (just those models, mirroring the app's at
the repo root — keep field names in sync) and generates its own `@prisma/client`
on install via `postinstall`. The tables themselves are created and owned by the
app's migration.

## Deploying

See **`DEPLOY.md`** — it's a Docker container (`Dockerfile` here), so it runs on
Railway / Render / Fly today and AWS ECS/Fargate later, unchanged.

## Not yet implemented

- **Pairing-code flow** — only QR pairing is wired (`requestPairingCode` is a
  later option).

Delivery/read receipts **are** forwarded: the worker maps Baileys
`messages.update` status (server-ack → sent, delivery-ack → delivered, read →
read) into `status` events the app applies to the stored message.
