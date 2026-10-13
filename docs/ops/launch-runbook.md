# Launch runbook

What to do when shipping, when something breaks, and how to undo it. Written in the 2026-10-12 launch sweep. Keep it short and current.

## Where things run

| Piece | Host | Health check |
|---|---|---|
| Web app + API + cron | Vercel project `clinicare` → `clinicare-vela.space` | Open `/login`; Vercel → Deployments shows the latest `main` as Ready |
| Database, auth, file storage | Supabase project `clinicare` (eu-central-1) | Supabase → Project overview is Healthy |
| WhatsApp worker | Railway (`services/whatsapp-worker`) | `https://<railway-domain>/health` returns `{"ok":true}`; Settings → WhatsApp shows Connected |
| Error monitoring | Sentry org `vela-vr`, project `javascript-nextjs` | New issues appear here first |
| Rate limiting | Upstash Redis (Vercel KV integration) | If it's down the app falls back to per-instance limits on its own |
| Staff app | Expo / EAS (`vela-mobile-app`) | Talks only to `/api/mobile/v1/*` on the web app |

## Shipping a change

1. Small PR → CI green → Codex clean → owner says merge.
2. Merging to `main` deploys production through Vercel's Git integration. Don't deploy with the `vercel` CLI, so every deploy maps to one commit.
3. **Database changes go first.** If a PR adds a column or enum, the owner runs its SQL in Supabase → SQL Editor *before* merging (e.g. `prisma/message-source-migration.sql`). Code that expects a column the database lacks fails on every request that touches it.
4. After the deploy: open `/login` and one signed-in page, and check Sentry for new issues over the next hour.

## Undoing a bad deploy

- **Vercel → Deployments → pick the last good one → Instant Rollback.** It takes seconds and doesn't need a rebuild. Then revert the commit on `main` so the next merge doesn't bring it back.
- A database change can't be rolled back this way. Additive changes (new columns or enum values) are safe to leave in place while the code rolls back; anything destructive needs its own reverse SQL written before it ships.

## When something breaks

1. **Sentry** (newest issues) and **Vercel → Logs / Observability → Errors** for server errors. Supabase → Logs for database or auth errors.
2. **Everyone is signed out or every page errors:** check Supabase status and the Vercel env vars `DATABASE_URL` and `DATABASE_SSL_CA` (a missing CA fails every query with P1011).
3. **Reminders or follow-ups stopped:** Vercel → Cron Jobs shows each run. The routes need `CRON_SECRET`. Reminders also need WhatsApp to be connected.
4. **WhatsApp shows Not connected / messages don't arrive:**
   - Railway → worker → Logs. Look for `WhatsApp worker listening` and lease messages.
   - Restart: Railway → service → Redeploy. The worker takes the lease back within its expiry window, and the saved session reconnects without a new QR.
   - If WhatsApp logged the device out (the phone removed the linked device, or about 14 days offline): Settings → WhatsApp → Connect and scan a new QR on the clinic phone.
   - "App webhook rejected event" in the worker log means the secrets don't match: `APP_WEBHOOK_SECRET` (Railway) must equal `BAILEYS_WEBHOOK_SECRET` (Vercel), and `BAILEYS_BRIDGE_SECRET` must match on both.
5. **Staff app can't sign in:** codes are single-use and expire. Issue a new one from the staff member's page → Mobile access. Revoking signs that phone out.

## Secrets

All secrets live only in Vercel and Railway env vars (marked Sensitive), never in the repo or chat. To rotate one, change it in both places that share it (the table in `services/whatsapp-worker/DEPLOY.md`), then redeploy both. Rotate immediately if a secret is ever pasted anywhere else.

## Backups

**Open decision (2026-10-12):** the Supabase organisation is on the Free plan, which has no restorable backups. See finding #9 in `docs/qa/final-sweep-findings.md`. Until that's settled there is no way to restore lost data.

## Contacts

| Role | Who |
|---|---|
| Owner / on call | _fill in_ |
| Supabase, Vercel, Railway, Sentry accounts | owner |
