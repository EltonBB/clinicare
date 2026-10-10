# Disposable mobile API database QA

`mobile-api.integration.test.ts` exercises actual mobile route handlers and server-side Prisma logic against a fresh PostgreSQL database. It is separate from the offline unit suite and runs only through the guarded harness.

Verified on 2026-10-10 against the current-main integration: **24 passed**, including the current no-show and waiting-list workflows. See [integration report](INTEGRATION-QA-2026-10-10.md). Earlier results from the older QA checkout are not acceptance evidence for this branch.

The Windows harness needs portable PostgreSQL binaries in a separate tooling folder. The verified runtime for the 2026-10-09 review is `@embedded-postgres/windows-x64@17.10.0-beta.17` (PostgreSQL 17.10). This tool is not an application dependency. Registry metadata points to [the package's official repository](https://github.com/leinelissen/embedded-postgres); its lockfile remains in the isolated tooling folder.

Run from a sanitized source snapshot with its own installed dependencies and **no loadable `.env` files** (inert `.example` templates are allowed):

```powershell
$env:QA_POSTGRES_BINARY_ROOT = 'C:\path\to\isolated\node_modules\@embedded-postgres\windows-x64\native\bin'
node scripts/qa-mobile-local-postgres.mjs
```

The harness refuses a busy port, generates a password, initializes a new directory, and binds PostgreSQL only to `127.0.0.1:55432`. It passes an allowlist of environment variables plus explicit local database settings to child processes. It refuses project/Prisma environment files before invoking Prisma CLI because Prisma can automatically load them. It never reuses or resets an existing database. Database files and a JSON result stay under ignored `.qa-postgres/mobile-*` for inspection; the server is stopped in `finally`. The bootstrap password file is deleted after initialization. Bootstrap `--no-sync` is appropriate for this disposable test cluster; crash durability is not tested.

Coverage includes code redemption and issuance races, token hashing/expiry/revocation, same-clinic staff and tenant isolation, appointment cancellation guards, messaging, notification ownership, response history caps, request size limits, push token validation, device/IP quotas and `Retry-After`, and concurrent attendance checks. Current-main coverage also checks owner action quotas, NO_SHOW protection/serialization, immutable cancellation history, reminder generation/cleanup, concurrent Pro waiting-list drafts, and Basic/closed-hours gates.

Evidence boundaries:

- Handlers execute in process using real `Request`/`Response` objects. This does not test a listening Next HTTP server, proxy/CORS headers, deployment routing, or a browser connected to this database.
- Prisma queries and transactions use genuine PostgreSQL. No database methods, mobile auth guard, limiter, route handler, or transaction are mocked. The cached Prisma connection uses a local pool without TLS; production TLS configuration is not covered.
- Only the web owner's identity, Next cache invalidation, and logging/telemetry are stubbed. Workspace ownership and action quotas execute their real implementations. Global `fetch` is blocked and the suite asserts that no provider network attempt occurred. The limiter exercises its local fallback, not distributed Redis enforcement.
- Prisma `db push` applies the declared schema. It does not verify production Supabase RLS, separate deployment SQL, provider configuration, or existing clinic data.
- All records are newly generated fictional QA data. No clinic credentials or records are loaded.

For local wait diagnostics only, set `QA_PG_DIAGNOSTICS=1`. The harness records statement timings with bind parameters disabled and samples connection states, wait types, and blocker IDs under the owned run directory. It does not change production configuration or transaction deadlines.
