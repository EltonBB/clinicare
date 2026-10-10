# Mobile QA integration — 2026-10-10

The mobile API repairs are integrated onto `origin/main` base `bbe2524949c614c91fe16111b8bda3a6c77ce46f` in branch `codex/mobile-qa-integration`. Current main's redesigned web interfaces, action quotas, record-ID validation, no-show protection and waiting-list transactions are preserved. This is a local review candidate; release and real-clinic acceptance are pending.

## Changes

- Exact fetched-message receipts preserve later unread arrivals. Both staff and admin can deliberately mark older history read. Receipt responses update badges only while their request/tab remains current.
- Concurrent enrollment issuance is Serializable. Existing owner action budgets and tenant ownership checks remain active.
- Request bodies have bounded bytes and read time. Authentication quotas expose Retry-After; mobile responses use private no-store caching.
- Push delivery excludes expired, revoked and inactive devices, batches valid tokens, and keeps a committed message successful when notification lookup fails.
- Seven hook repairs are adapted to current main's components. Search ignores aborted responses and uses the dialog's focus handling; delayed Mark-all completion cannot overwrite a newer badge after tab removal.
- Dependencies retain current main's React/Prisma/adapter versions, apply the reviewed braces backport, and use compatible tooling/deepmerge/PostCSS updates.

## Verification

| Check | Result |
|---|---|
| TypeScript | Passed |
| Full repository lint | Passed |
| Production Prisma generation and Next build | Passed |
| Deterministic receipt regressions | 5 passed |
| Fresh PostgreSQL integration | 24 passed |
| Listening Next HTTP with real Prisma and TLS PostgreSQL | 15 passed; TLSv1.3 |
| Dependency regressions and Prisma schema validation | Passed |
| Worker TypeScript | Passed |
| Full unit suite | 1,679 passed across 93 suites; zero failures |
| Independent medium review, simplification review, final review | No actionable findings |

The initial full unit run had seven failing worker tests and one worker suite that could not load because the separate worker dependencies (`baileys` and `qrcode-terminal`) were absent. All application suites passed. Automatic approval review rejected the worker installation with “blocked by policy”; the user completed the manual installation successfully. The subsequent full suite passed all 1,679 tests across 93 suites, and the worker typecheck passed. No test expectations were weakened.

The scanner reports seven high entries in the full dependency tree and four in production, all tracing to the same upstream braces advisory. Its installed source is patched and the regression checks pass; the original version and raw audit findings remain visible. See [dependency evidence](evidence/dependency-security-2026-10-10.json).

The 24 database cases include real owner action quotas, NO_SHOW refusal/serialization, immutable cancellation history, reminder generation/cleanup, concurrent Pro slot-offer drafts, Basic/closed-hours gates, receipt/send overlap, ownership and authentication. The 15 HTTP checks run ordinary `next start` with no route/auth/Prisma mocks. Both temporary listeners shut down, and ports 3100/55432 are clear. The mobile preview remains stopped.

## Acceptance remaining

- Push the reviewed candidate, pass repository CI/Codex review, and verify the release through the repository's Git deployment workflow.
- Connect the mobile app to that verified backend and enter a fresh staff access code directly in the app.
- Verify signed-in behavior on physical iPhone and Android, real push delivery, hosted distributed quotas, storage and messaging providers. Local fictional data tests do not establish those results.

No hosted schema changes or clinic-data writes were made. Local tests use freshly generated fictional records and synthetic configuration; loadable environment files are rejected. The prior mobile/native export evidence and older backend QA results remain separate from this current-main integration.
