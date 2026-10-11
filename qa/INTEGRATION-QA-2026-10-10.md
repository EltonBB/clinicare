# Mobile QA integration — 2026-10-10

The mobile API repairs are integrated onto `origin/main` base `bbe2524949c614c91fe16111b8bda3a6c77ce46f` in branch `codex/mobile-qa-integration`, submitted as [PR #144](https://github.com/EltonBB/clinicare/pull/144). Current main's redesigned web interfaces, action quotas, record-ID validation, no-show protection and waiting-list transactions are preserved. Release and real-clinic acceptance are pending.

## Follow-up — 11 October

The original PR head `7814c575eda49914f20264cb400ef68a1c6ec035` passed repository CI and its Vercel preview build; the Codex review completed without inline findings. The mobile candidate is separately submitted in [mobile PR #24](https://github.com/EltonBB/vela-mobile-app/pull/24).

A subsequent audit of the separately locked WhatsApp worker found five package entries: one critical proxy-addr finding, three high Prisma/config/deepmerge entries and one moderate music-metadata entry. Four authentic published lock replacements and the scoped Prisma override are installed and independently reviewed. Fresh full and production worker audits report zero findings; actual Express, Baileys and Prisma consumer regressions pass. [Worker repair and verification boundaries](WORKER-DEPENDENCY-SECURITY.md).

The user completed the manual dependency update after the agent's installation was policy-blocked. Post-install worker TypeScript, all 1,679 tests across 93 files, guarded security regressions and their scoped lint passed. Root TypeScript, full lint (zero warnings) and the production build also passed again. The equivalent receipt-counter cleanup assignment removes a lint warning without changing invalidation behavior. Neither PR has been merged or released; the follow-up still needs remote CI/review after push.

[October 11 dependency gate evidence](evidence/integration-followup-2026-10-11.json) and its [471-file source manifest](evidence/integration-source-2026-10-11.json) preserve the earlier October 10 results separately. At that dependency-only checkpoint, 447 of the original 448 source files were byte-identical; only the equivalent receipt-counter assignment had changed. Its API/library/Prisma and integration-test sources were unchanged, so the 24 PostgreSQL, 15 HTTP and five focused receipt results below were retained results. The manifest also includes the worker source/configuration and new security runner. The later Expo-token correction and database rerun are recorded next.

The dependency follow-up `c0a1cb23bd369ee7e5603592a127cdd41cac11d2` passed remote CI and its Vercel preview build. CI reported deprecated Node 20 actions and an upcoming `ubuntu-latest` image change. A subsequent workflow-only maintenance change pins Ubuntu 24.04, uses the locally tested Node 24 major, restricts checkout to read-only credentials without persistence, and adds the guarded worker regression to CI. Checkout [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) and setup-node [v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) are pinned to their verified immutable commit IDs. This workflow is outside the application source manifest; its exact-commit CI/review must pass after push.

## Expo push-token correction — 11 October

The workflow head `6b7143c32f5b54f4e616e237d06347ee3658e436` passed CI, including all three worker consumer regression groups, and its Vercel preview build. Codex's review identified one compatibility issue: the central push predicate rejected the UUID-style form supported by [Expo's official implementation](https://github.com/expo/expo-server-sdk-node/blob/main/src/ExpoClient.ts). This could reject code redemption/registration or filter a stored valid token from delivery.

The predicate now accepts Expo's case-insensitive alphanumeric 8-4-4-4-12 form alongside bracketed tokens, while rejecting boundary whitespace. Redemption, registration and outbound filtering share this predicate. Authentication, body limits, the 256-character input limit, quotas and tenant ownership checks are unchanged. A sibling audit found that mobile already forwards Expo's returned token unchanged; no mobile source change was needed.

The new regression first reproduced four failures, then all 14 focused tests passed. Root TypeScript, full lint and the production build passed again; the full unit suite now passes **1,682 tests across 93 files**. A fresh fictional PostgreSQL run passes **25 cases**, including actual UUID-style redemption/persistence and registration updates, rejection without consuming an access code, and preservation of the stored token after a rejected update. The database stopped successfully. Independent correctness, one simplification review and final confirmation were clean. Exact new-head remote checks remain pending until push.

[Correction evidence](evidence/expo-token-compatibility-2026-10-11.json) and its [current source manifest](evidence/integration-source-expo-tokens-2026-10-11.json) retain the earlier evidence separately. Only the central predicate and three test files changed from the dependency-stage manifest. The 15 HTTP/TLS and five focused receipt results remain earlier checks; they were not rerun for this correction. Root/worker dependency trees and the mobile candidate are unchanged.

## Changes

- Exact fetched-message receipts preserve later unread arrivals. Both staff and admin can deliberately mark older history read. Receipt responses update badges only while their request/tab remains current.
- Concurrent enrollment issuance is Serializable. Existing owner action budgets and tenant ownership checks remain active.
- Request bodies have bounded bytes and read time. Authentication quotas expose Retry-After; mobile responses use private no-store caching.
- Push delivery excludes expired, revoked and inactive devices, batches valid tokens, and keeps a committed message successful when notification lookup fails.
- Seven hook repairs are adapted to current main's components. Search ignores aborted responses and uses the dialog's focus handling; delayed Mark-all completion cannot overwrite a newer badge after tab removal.
- Dependencies retain current main's React/Prisma/adapter versions, apply the reviewed braces backport, and use compatible tooling/deepmerge/PostCSS updates.

## Initial verification — 10 October

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
| Full unit suite | 1,679 passed across 93 files; zero failures |
| Independent medium review, simplification review, final review | No actionable findings |

The initial full unit run had seven failing worker tests and one worker suite that could not load because the separate worker dependencies (`baileys` and `qrcode-terminal`) were absent. All application suites passed. Automatic approval review rejected the worker installation with “blocked by policy”; the user completed the manual installation successfully. The subsequent full suite passed all 1,679 tests across 93 files, and the worker typecheck passed. No test expectations were weakened.

Fresh October 11 root audits still report seven high entries in the [full dependency tree](evidence/root-audit-full-2026-10-11.json) and four in [production](evidence/root-audit-production-2026-10-11.json), all tracing to the same upstream braces advisory. Its installed source is patched and the regression checks pass; the original version and raw audit findings remain visible. See [dependency evidence](evidence/dependency-security-2026-10-10.json).

The 24 database cases include real owner action quotas, NO_SHOW refusal/serialization, immutable cancellation history, reminder generation/cleanup, concurrent Pro slot-offer drafts, Basic/closed-hours gates, receipt/send overlap, ownership and authentication. The 15 HTTP checks run ordinary `next start` with no route/auth/Prisma mocks. Both temporary listeners shut down, and ports 3100/55432 are clear. The mobile preview remains stopped.

## Acceptance remaining

- Push the dependency follow-up and pass CI/Codex review for its exact commit.
- Review both pull requests before release; verify any later release through the repository's Git deployment workflow. The provider worker needs its separate normal release process.
- Connect the mobile app to that verified backend and enter a fresh staff access code directly in the app.
- Verify signed-in behavior on physical iPhone and Android, real push delivery, hosted distributed quotas, storage and messaging providers. Local fictional data tests do not establish those results.

No hosted schema changes or clinic-data writes were made. Local tests use freshly generated fictional records and synthetic configuration; loadable environment files are rejected. The prior mobile/native export evidence and older backend QA results remain separate from this current-main integration.
