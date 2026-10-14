# Final launch sweep — plan (2026-10-12, not started)

Goal: before launch, prove end to end that the web app, the WhatsApp worker and the Vela Staff app are correct, secure, fast enough and recoverable, with no known open defects. Each finding is fixed in a small PR through the normal loop (review → ponytail → Codex → owner go-ahead to merge).

## Ground rules

- Test against **localhost + the "Vela Dent" QA workspace** and a **Vercel preview**, never by stressing production. Production gets read-only probes only.
- No real WhatsApp sends to patients. Seeded future appointments keep their SENT reminder guards.
- The owner signs in; Claude never enters passwords. No secrets in chat, logs or commits.
- Token efficiency: direct Grep/Read first; `/code-review` at medium for risky areas; one agent per independent area at most.
- Every finding is recorded in a ledger (`docs/qa/final-sweep-findings.md`): severity, repro, fix PR, status. Nothing is "done" without evidence (test, screenshot, query or log).

## What the owner needs to provide

1. A **second test workspace** (a separate signup). It is needed for the cross-clinic isolation tests in Phase 2.
2. Sign-ins in the in-app Browser pane when asked (localhost and preview).
3. Approval of the **load-test target and size** before Phase 5 runs.
4. Optional: authorize the Supabase and Vercel MCP connectors (via `/mcp`), so security advisors and runtime logs can be read directly.
5. For the phone part of Phase 8: the Firebase/APNs push setup and a preview build on a real iPhone and Android phone.

## Phase 1 — Inventory (½ session)

Build the checklist the rest of the sweep runs against:
- Every route (`src/app/**/page.tsx`), API route (`src/app/api/**`), server action (`actions.ts`), cron, the webhook and the mobile API.
- Every form and button per page, from the components.
- Every env var and secret: where it is read, whether it is `NEXT_PUBLIC_`, and whether it is set in Vercel and Railway.
- Output: `docs/qa/final-sweep-inventory.md`.

## Phase 2 — Security (1–2 sessions)

- **AuthZ on every entry point.** For each server action and API route, confirm it does three things: authenticates through the workspace helpers, scopes every query by `businessId`, and validates record ids (`parseRecordId`).
- **Cross-tenant (IDOR) tests with workspace B:**
  - Workspace B tries to read and mutate workspace A's clients, appointments, payments, documents, conversations, staff, threads, follow-ups and waitlist.
  - Repeat with mobile device tokens and the cron/webhook auth.
- **Auth flows:**
  - Signup, email confirmation, login and logout.
  - Password reset, including the recovery-cookie note.
  - Session expiry, the open-redirect regression and `next=` handling.
  - Brute-force limits on login and forgot-password.
- **Secrets and leaks:**
  - Scan the production client JS bundles for secrets.
  - Check source maps aren't public.
  - Check error responses and logs carry no patient data or provider internals.
  - Check every `NEXT_PUBLIC_` value is safe to publish.
- **Database and storage:**
  - RLS on every table, and the anon REST API returns nothing.
  - Storage bucket policies, and signed-URL expiry and scope.
  - Upload type and size limits.
  - Supabase security and performance advisors.
- **Headers and transport:** CSP (including the `unsafe-inline` decision), HSTS, CORS on `/api/mobile` only, cookie flags.
- **Webhook and cron:**
  - HMAC and freshness checks.
  - A replay attempt is rejected.
  - Cron routes reject missing or wrong secrets.
- **Dependencies:** `npm audit` for the app, worker and mobile app, plus a licence check.

## Phase 3 — Rate limits and abuse (½ session)

- Map every limiter (Upstash plus the in-memory fallback): per-IP, per-user, per-device and per-clinic WhatsApp.
- Verify each one fires, returns `Retry-After` and recovers. Include the fallback path when Redis is unavailable.
- Look for unlimited endpoints: search, uploads, exports/CSV, the AI refresh cooldown, pairing/QR.

## Phase 4 — Functional QA of every feature (2–3 sessions)

Signed in on localhost with the seeded data, at desktop and phone widths. Each feature gets three passes: the happy path, then the edge cases (empty, max length, invalid, duplicate, double-click, back/refresh mid-action, stale tab, two tabs), then the error states.

- **Onboarding:** a fresh signup through onboarding, the tour, and the Basic vs Pro gating.
- **Dashboard and Calendar:**
  - KPIs against the database.
  - Calendar day, week and month views, month loading, quick view, booking/edit/cancel/no-show, closed days, overlap prevention, time-zone edges.
- **Clients:**
  - Search, filter and pagination.
  - The full detail page: every tab, and add/edit/delete of each sub-record.
  - Documents and gallery upload, preview and delete, plus the CSV statement.
- **Staff:** create/edit, shifts, check-in/out rules, mobile access codes and revoke, the Messages tab.
- **Inbox:**
  - Conversations, reply, convert to client, delete, unread counts.
  - Follow-ups: drafts, send and dismiss, and the slot-offer flow with the waiting list.
- **Reports:** every period and the custom range, AI and rule-based snapshots, the refresh cooldown, Basic upgrade state.
- **Settings:** each section, save/discard, logo upload, working hours, reminders, workflows, WhatsApp status, billing display.
- **Marketing and legal:** all public pages and `/checkout` stay preparation-only.
- **Accessibility:** a WCAG AA pass on the key pages (`design:accessibility-review`), covering keyboard navigation, focus, contrast and labels.

## Phase 5 — Performance and load (1 session, needs the owner's approval of target and size)

- **Page timings:** server render times for each page with the seeded data, the slowest queries via `pg_stat_statements` or the advisors, any N+1 patterns, and missing indexes.
- **Load test** against a **Vercel preview** using the QA workspace, with a small, approved concurrency (e.g. 20–50 virtual users). Cover dashboard/calendar reads, mobile API polling and Inbox sends with sending stubbed.
- **What to watch:** DB pool use (`max: 1` per instance on the transaction pooler), Upstash latency, cold starts and Vercel function duration.
- **Cron jobs:** reminders, follow-ups and analytics at realistic data volume, against the time budget each run has (`maxDuration`).
- **Bundle size and Web Vitals** for the marketing and workspace pages.
- **Scaling note:** Vercel scales the web app automatically, so there's no load balancer to configure. The real limits are database connections, the single WhatsApp worker (lease-based) and Upstash. Document each one's ceiling.

## Phase 6 — WhatsApp worker and resilience (½ session)

- **Worker restarts:** a redeploy hands off the lease, connection status stays correct and the session survives.
- **Failure handling:** worker down, timeout, an uncertain send (no duplicate), and a webhook that arrives late or out of order.
- **Reply handling:** confirm/cancel by reply, the acknowledgement limits, and recovery from an abandoned lease.
- **Backups:** confirm the Supabase backup/PITR setting and write a short restore note.

## Phase 7 — Observability and ops (½ session)

- **Monitoring:** Sentry receives errors on server and client with patient data scrubbed; the `SENTRY_DSN` warnings were seen locally, so confirm it's set in production.
- **Environment variables:** all production and worker env vars set (`CRON_SECRET`, the Baileys secrets, `OPENAI_API_KEY`, `EXPO_ACCESS_TOKEN` decision, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_SSL_CA`).
- **Alerts:** uptime checks for the app and the worker, and an alert when cron runs fail.
- **Launch runbook:** deploy, rollback, the worker re-pair procedure, and who to call.

## Phase 8 — Vela Staff app (1 session plus the owner's device time)

- **Browser preview against localhost:** every screen, the lock/idle flows, offline, slow network, expired and revoked sessions, the rate-limit cooldown, deep links.
- **Real devices (preview build, owner-held phones):**
  - Biometric/passcode unlock and push delivery, including tapping a notification.
  - Keyboard and Android back, background/foreground, and process recovery.
  - Store requirements: icons, permissions text, privacy labels.

## Phase 9 — Close out

- Fix PRs merged, then a regression run: the full test suites, a short end-to-end pass of both apps on production, and the database health query.
- Findings ledger complete, and PROJECT_STATUS updated.
- A go/no-go summary listing anything consciously deferred, with the reason.

## Rough size

About 7–10 working sessions, with Phases 2, 4 and 5 the largest. Phases 2 and 3 can start right after Phase 1. Phase 5 waits for your load-test approval; Phase 8's device part waits for the push setup.
