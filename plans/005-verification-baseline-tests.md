# 005 — Verification baseline (Vitest + characterization tests)

**Base commit:** `fcd3eb9` · **Category:** tests / DX · **Effort:** M · **Risk:** LOW ·
**Depends on:** nothing. **This is the enabler** — plans 001, 004, 006 and the
god-module refactors (ARCH-04/05/06) are MED-risk specifically because there is no
automated test. Land this first.

## Why this matters

CLAUDE.md states plainly: "There is no automated test suite — signed-in browser QA
is the manual gate." Every refactor that touches money, status, or timezone math is
therefore a blind change. The highest-value test investment is **pure-function
characterization tests** around the logic that (a) is most dangerous to get wrong
and (b) has zero side effects, so it needs no DB or auth.

## Scope — target the pure, dangerous logic (not coverage %)

Add **Vitest** (fast, zero-config for this stack, no DB needed) and write
characterization tests for the pure functions that encode business rules:

1. **Money** — `summarizePayments` (plan 001) / current payment reducers in
   `lib/clients.ts` + `lib/dashboard.ts`: every status combination, partial
   payments, refunds, empty.
2. **Time zone** — `lib/time-zone.ts`: `parseZonedWallClock`, `getZonedDayWindow*`,
   `getZonedWeekWindow`, `getZonedMonthWindow`, `zonedCalendarDaysBetween`. Cover a
   US zone (e.g. `America/New_York`) and a DST transition day — this is the bug
   class the audit found in `parseOptionalDate` (BUG-05).
3. **Appointment status** — once plan 006 centralizes them, test
   `isFinalized`/`isCompleted`/`statusLabel`; until then, snapshot the current
   per-surface counts.
4. **Reports/dashboard view models** — characterization snapshots over a fixed
   in-memory dataset (the parity guard for plan 004). Feed `buildReportsViewFromWorkspace`
   / `buildDashboardViewFromWorkspace` synthetic records, snapshot the output.

## Steps

1. `npm i -D vitest @vitest/coverage-v8` (dev-only). Add `"test": "vitest run"` and
   `"test:watch": "vitest"` to `package.json` scripts.
2. Add a minimal `vitest.config.ts` (node environment; no jsdom needed for pure
   functions). Path alias `@/` must resolve — mirror `tsconfig.json` paths.
3. Put tests next to sources as `*.test.ts` (e.g. `src/lib/time-zone.test.ts`) or
   under `src/__tests__/` — pick one and document it.
4. Write the suites above. For the view-model snapshots, construct typed fixture
   records (no Prisma, no network) and pass them straight to the builders.
5. Wire `test` into the documented pre-push gate in CLAUDE.md
   (`typecheck → lint → test → build`).

## Verification

- `npm run test` passes and runs in seconds (pure functions, no DB).
- `npm run typecheck && npm run lint && npm run build` still green (Vitest is
  dev-only; ensure it isn't pulled into the Next build).
- Deliberately break a money/tz function locally and confirm a test fails (the
  suite actually guards the logic).

## Out of scope

- No integration/E2E here (no DB spin-up, no Playwright) — those are a later step.
- Don't chase a coverage percentage; cover the dangerous pure logic well.
- Don't test React components in this plan.
