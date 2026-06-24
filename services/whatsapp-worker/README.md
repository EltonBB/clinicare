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

Both directions authenticate with a single shared secret in the
`x-vela-bridge-secret` header (constant-time compared). The worker is trusted
infra inside the boundary, so it names the `businessId` directly.

## Endpoints

| Method | Path | Body / Query | Purpose |
|---|---|---|---|
| GET | `/health` | — | Liveness (no auth) |
| POST | `/pair` | `{ businessId }` | Start a session; QR arrives async via `/status` |
| GET | `/status` | `?businessId=` | `{ status, qr? }` — poll for the QR / connection |
| POST | `/send` | `{ businessId, to, body }` | Send text; `to` is digits-only E.164 |

All except `/health` require the `x-vela-bridge-secret` header.

## Run locally

```bash
cd services/whatsapp-worker
npm install
cp .env.example .env        # fill in BAILEYS_BRIDGE_SECRET, APP_WEBHOOK_URL, DATABASE_URL
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

The worker reads/writes only its own `WhatsAppSession` and `WhatsAppSessionKey`
tables (non-PHI WhatsApp link credentials). It is **self-contained**: it carries
a minimal `prisma/schema.prisma` (just those two models, mirroring the app's at
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
