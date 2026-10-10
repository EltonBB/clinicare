# Listening Next HTTP → Prisma → TLS PostgreSQL QA

Verified on 2026-10-10: **15 passed**, using ordinary `next start`, a freshly initialized PostgreSQL cluster, and the production Prisma connection seam. No route, proxy, auth, limiter, Prisma, telemetry, or cache method is mocked. All rows are fictional. See [integration report](INTEGRATION-QA-2026-10-10.md) and [HTTP evidence](evidence/mobile-http-postgres-2026-10-10.json).

Run from a sanitized source snapshot with its own dependencies, generated Prisma client, completed production build, and no loadable `.env` files (inert `.example` templates are allowed):

```powershell
$env:QA_POSTGRES_BINARY_ROOT = 'C:\path\to\isolated\postgres\native\bin'
$env:QA_OPENSSL_PATH = 'C:\path\to\openssl.exe'
node qa/mobile-http-postgres.mjs
```

The harness refuses occupied ports and environment files. It creates an owned `.qa-postgres/http-*` directory, initializes a new SCRAM-authenticated database, creates a one-day QA certificate, and binds PostgreSQL to `127.0.0.1:55432` and Next to `127.0.0.1:3100`. Certificate verification remains enabled: the QA certificate is supplied through `DATABASE_SSL_CA` only to the sanitized Next child and local setup client. No system certificate store, firewall, service, application TLS behavior, or existing database is changed. Schema setup uses `db push`, then HTTP requests exercise the production build. `finally` stops the owned listeners; fictional database files remain for inspection.

Actual HTTP coverage: CORS preflight; unauthorized JSON with private no-store/security headers; one-time enrollment and token hashing; profile retrieval; peer-appointment and foreign-thread isolation; five concurrent cancellations with exactly one admin system message/confirmation; NO_SHOW refusal and Pro future-slot draft creation; five concurrent messages with every unread increment preserved; malformed/oversized JSON; exact snapshot receipts with a 100-message history cap and later unseen arrivals; unknown/foreign read selections with no partial writes; empty-selection no-op and deliberate mark-all for hidden history; immediate staff deactivation/reactivation; per-device quota with CORS-visible `Retry-After`; logout revocation. Negotiated TLS details are recorded by the run.

For coordinated browser QA, set `QA_HTTP_HOLD=1`. After assertions pass, the harness creates a fresh fictional access code, restores one confirmed appointment, and adds a currently active shift. Connection details are written only to that run's `browser-fixture.json`. Listeners remain available for at most 30 minutes; creating an empty `stop-request` file in that exact run directory requests cleanup earlier. Do not put the fictional device code or database credentials in committed evidence.

Boundaries: this is a local production build, not a hosted deployment. It does not cover Supabase RLS/deployment SQL, external web-owner authentication, Expo native/iOS/Android execution, real push delivery, storage, WhatsApp, or distributed Redis enforcement. Optional provider credentials are absent; the selected routes do not invoke providers. Redis rate limiting uses its documented process-local fallback. Browser/UI evidence is separate.

Readiness uses a three-minute startup deadline, bounded HTTP requests, and an actual JSON 401 rather than trusting the Next “Ready” line. Cleanup and listener checks are recorded with each run. A separate browser launch was previously blocked by automatic policy review; this harness makes no browser-to-real-API or real-clinic claim.
