# Deploying the WhatsApp worker (Railway)

The **app stays on Vercel.** Only this worker runs on Railway, because Baileys
needs a 24/7 process holding a WebSocket — which Vercel's serverless functions
can't do. The worker is a Docker container, so the same image moves to AWS
ECS/Fargate later with no code changes.

Everything talks to the **same Supabase Postgres** the app already uses.

---

## 0. Prerequisite (app side)

The Baileys integration lives on the `feat/messaging-seam` branch. For the
**Vercel app** to have the WhatsApp UI + send/receive, that branch must be
merged to `main` (or deployed as a preview) **with the env vars in step 3 set**.
The worker (steps 1–2) can be deployed independently, any time.

---

## 1. Create the Railway service

1. Railway → **New Project → Deploy from GitHub repo** → pick this repo.
2. Open the service → **Settings → Source** → set **Root Directory** to:
   ```
   services/whatsapp-worker
   ```
   (This makes Railway build *only* the worker, using its `Dockerfile`.)
3. Railway auto-detects the `Dockerfile` (the included `railway.json` pins it).

## 2. Give the worker a public URL

Settings → **Networking → Generate Domain**. You'll get something like
`https://vela-whatsapp-worker-production.up.railway.app`. **Copy it** — the app
calls the worker at this URL. (Railway injects `PORT`; the worker already reads
it.)

## 3. Set the worker's environment variables

Service → **Variables** → add:

| Variable | Value |
|---|---|
| `BAILEYS_BRIDGE_SECRET` | a long random string (generate one; reused on Vercel below) |
| `APP_WEBHOOK_URL` | `https://<your-vercel-domain>/api/webhooks/whatsapp/baileys` |
| `DATABASE_URL` | the **same** Supabase connection string the app uses (Vercel → `DATABASE_URL`). ⚠ **NOT `localhost` and NOT the `.env.example` placeholder** — a wrong value lets `/health` pass but makes `/pair` fail with "database unavailable". |
| `LOG_LEVEL` | `info` (optional) |

> TLS: with just `DATABASE_URL` the worker connects encrypted (cert not
> verified) — fine for the non-PHI pilot. To enforce verification later, also
> set `DATABASE_SSL_CA` to the Supabase CA cert (same value Vercel uses).

Deploy. In **Logs** you should see `WhatsApp worker listening`. Sanity check:
opening `https://<railway-domain>/health` returns `{"ok":true}`.

## 4. Point the app at the worker (Vercel)

Vercel → the app project → **Settings → Environment Variables** → add:

| Variable | Value |
|---|---|
| `BAILEYS_WORKER_URL` | the Railway domain from step 2 |
| `BAILEYS_BRIDGE_SECRET` | the **same** secret as step 3 |

Redeploy the app so it picks them up.

## 5. Pair a number

In the app → **Settings → WhatsApp → Connect WhatsApp** → a QR appears → on the
pilot phone open **WhatsApp → Settings → Linked devices → Link a device** and
scan it. The status flips to **Connected**.

From then on: reminders go out, Inbox replies send, incoming messages arrive,
and delivery/read ticks update — all through this worker.

---

## Moving to AWS later

The worker is a standard Docker container. On AWS, build the same `Dockerfile`
into ECR and run it on ECS/Fargate (or Lightsail Containers / App Runner). Then
just update the app's `BAILEYS_WORKER_URL` to the new address. No code changes.

## Troubleshooting

- **App says "WhatsApp connection isn't available yet"** → the app's
  `BAILEYS_WORKER_URL` / `BAILEYS_BRIDGE_SECRET` aren't set (or the app wasn't
  redeployed after setting them).
- **Worker logs "App webhook rejected event" (401)** → the `BAILEYS_BRIDGE_SECRET`
  on Railway and Vercel don't match.
- **Worker can't reach the database** → check `DATABASE_URL` (use the Supabase
  pooler URL the app uses).
- **Session drops after a while** → the linked phone went offline or unlinked
  the device; re-pair from Settings.
