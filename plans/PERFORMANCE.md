# Vela — Performance & Scaling Report

> Profile + ranked execution plan for speed, scaling, and data handling. Built
> from a **live profile** (Supabase performance advisor + table stats on the prod
> project) plus static call-graph analysis. Ranked by performance impact; each
> item carries an effort estimate and a timeline.
>
> **Base commit:** `61c1da5` (branch `chore/codebase-hardening`).

## Profiling method & the key finding

- **Live DB profile:** Supabase performance advisor (`unindexed_foreign_keys`,
  `unused_index`) + `pg_stat_user_tables` row counts/sizes on the prod project.
- **Static profile:** call-graph trace of every `lib/*` view-model builder, all
  `actions.ts`, and the cron routes for query shape (N+1, unbounded, JS aggregation).
- **Payload:** Next/Vercel response path; RSC payload composition.
- **Pipeline:** Vercel Git-integration build (`prisma generate && next build`);
  there is no GitHub Actions CI.

**The defining fact: the bottlenecks are STRUCTURAL, not current-scale.** The prod
DB is tiny today (Appointment 121 rows, Client 24, Message 14, ClientPayment 23),
so nothing is slow *now* — Postgres seq-scans 24-row tables faster than it reads an
index. Every finding below is about **what breaks at scale** (thousands of clients
/ tens of thousands of appointments per clinic, many clinics). That is exactly the
"handling large amounts of data and users" target, so the work is forward-looking
hardening, not firefighting.

---

## Pillar 1 — Technical bottlenecks (CPU / memory / DB)

Ranked by impact at scale.

### P1 · Reports/analytics: fetch 7 months of rows, reduce in JS (40+ passes)
- **Where:** `lib/report-data.ts` (fetches every appointment in a 210-day window +
  every message), `lib/reports.ts` (`buildPeriodStats` ×8, chart builders re-filter
  per bucket → ~40 linear passes per render).
- **Cost at scale:** the single largest CPU + memory + DB-transfer cost in the app,
  paid **per Reports render AND per Pro business in the analytics cron** (`maxDuration
  = 300`). At a busy clinic (tens of thousands of appts/7mo) this dominates the page
  and can blow the cron's per-tenant time budget.
- **Fix:** push counts/sums/buckets into Postgres (`groupBy` by status, `date_trunc`
  bucket counts at the app TZ, message-direction `groupBy`); JS only shapes results.
- **Effort:** L · **Timeline: ~3–4 days** (parity-critical — needs the characterization
  snapshots from the test baseline first). Plan: [004](004-reports-dashboard-db-aggregation.md).

### P2 · Booking surfaces load the entire client table into the browser
- **Where:** `calendar/new/page.tsx` + `calendar/page.tsx` — `client.findMany({ businessId, isArchived:false })`, **no `take`**, rendered into a `<select>`.
- **Cost at scale:** every calendar visit ships ~all clients (id/name/phone) into the
  RSC/HTML payload and builds an N-option native select — hundreds of KB + a sluggish
  control, growing linearly. The #1 unbounded-payload cliff.
- **Fix:** typeahead combobox + scoped search endpoint (reuse `/api/search`); bounded
  initial list; fetch the `?client=` preselect by id.
- **Effort:** M · **Timeline: ~1.5–2 days** (UI; needs signed-in QA). Plan: [003](003-booking-client-search.md).

### P3 · Dashboard: 30 days of appointment rows reduced in JS for ~5 KPIs + 14 bars
- **Where:** `dashboard/page.tsx` analytics fetch + `lib/dashboard.ts` `buildVisitsSummary`/completion/avg-duration.
- **Cost at scale:** the most-visited page transfers a month of appointment rows to
  compute scalars + 14 zoned day-buckets.
- **Fix:** `appointment.groupBy` by status (completion), date-bucketed counts (bars),
  `_avg` on duration. **The payments half of this is already done** (see below).
- **Effort:** M · **Timeline: ~1 day.** Plan: [004](004-reports-dashboard-db-aggregation.md).

### P4 · Staff directory loads every month-to-date appointment per staff member
- **Where:** `staff/page.tsx` — `staffMember.findMany` includes `appointments` (no `take`)
  just to compute count aggregates in `lib/staff.ts`.
- **Cost at scale:** memory + DB scale with monthly appt volume × staff count, for a
  page that only needs counts.
- **Fix:** grouped `count` queries keyed by `staffMemberId`; drop the row hydration.
- **Effort:** M · **Timeline: ~0.5–1 day.**

### P5 · Unindexed foreign keys (9 tables) — ✅ schema done, ⏳ apply pending
- **Where:** advisor flagged `clientId` FKs on ClientMedication, ClientDocument,
  ClientPayment, ClientHealthItem, ClientCareNote, ClientTreatmentPlanItem,
  ClientFollowUpReminder, ClientGalleryItem, Message. The existing
  `(businessId, clientId, …)` composites are businessId-first and don't serve
  `WHERE clientId = …` (client-detail sub-record loads, cascade deletes).
- **Fix:** `@@index([clientId])` on each (in `schema.prisma`); 2 redundant indexes
  removed (duplicated a UNIQUE's index).
- **Effort:** S · **Timeline: minutes** — ⏳ **owner action: apply** via `npm run db:push`
  or paste [`prisma/perf-indexes.sql`](../prisma/perf-indexes.sql) into the Supabase SQL editor.

### P6 · Convert-to-client scans the whole client table for one phone match
- **Where:** `inbox/actions.ts` — `client.findMany({ businessId })` then JS `.find` on a
  fuzzy phone key (the `(businessId, phone)` index exists but the match is JS-side).
- **Fix:** normalized-phone column + `@@unique([businessId, normalizedPhone])` → indexed
  `findFirst`. (Bundle with P2's search normalization.)
- **Effort:** S–M · **Timeline: ~0.5 day** (backfill existing rows).

---

## Pillar 2 — Data & payloads

### Compression (gzip / Brotli) — already handled, verify
On Vercel, **response compression (Brotli + gzip) is automatic at the edge** for
all responses, including RSC/server payloads — there is nothing to configure in
`next.config.ts` (Next's `compress` is bypassed on Vercel). **Action:** none in code;
optionally verify in prod with `curl -sI -H 'Accept-Encoding: br' <url>` →
`content-encoding: br`. The real payload lever is **size**, addressed below.

### Payload-size reduction (the actual win) — ranked
1. **Ship aggregates, not row arrays** — P1/P3/P4 above. A `groupBy` returns a handful
   of rows; the JS path shipped the whole window into Node (and the dashboard/report
   computation parsing overhead the prompt calls out). ✅ **payments groupBy landed.**
2. **Pagination on unbounded lists** — P2 (booking), P4 (staff). Clients directory is
   already URL-paginated; bring the booking/staff surfaces in line.
3. **`AnalyticsSnapshot` JSON blobs** — 1.26 MB for 16 rows (the AI snapshot payloads).
   Fine at current scale; if these are ever read in bulk, select only needed fields.
4. **Streaming:** not needed yet — the workspace pages are RSC (server-rendered, no
   client fetch waterfall) and already use `Promise.allSettled` fan-out on the dashboard.
   Revisit only if a single page's data genuinely can't be aggregated down.

### Caching
- React `cache()` already dedupes auth/workspace lookups per request (good).
- **Opportunity:** the analytics snapshot is persisted in `AnalyticsSnapshot`, but the
  rule-based view is recomputed every Reports render. After P1, consider
  `unstable_cache`/segment revalidation on the heavy report computation (short TTL —
  these are operational dashboards, so keep staleness tight). *Effort S, after P1.*

---

## Pillar 3 — Workflow & pipeline

- **No GitHub Actions CI** — deploys run on **Vercel Git integration**
  (`prisma generate && next build`, build cache automatic). One commit = one deploy.
- **The real pipeline bottleneck is the *quality gate*, not build speed.** There was
  **no automated test suite** — the only gate was manual signed-in browser QA (the
  "manual testing queue" the prompt names), and no reusable signed-in session exists.
  ✅ **Addressed this loop:** added Vitest + 19 characterization tests + a `typecheck`
  script. **Next:** wire `typecheck → lint → test` as the pre-deploy gate (a 5-line
  GitHub Action or a Vercel "ignored build step") so regressions are caught before a
  deploy, not in manual QA. *Effort S · Timeline ~0.5 day.*
- **Build speed:** `next build` is dominated by compiling the marketing 3D/motion deps
  (three/gsap/lenis) — already code-split (`dynamic`, `ssr:false`) so they don't bloat
  the workspace runtime; no action needed for build time at this size.

---

## Master ranking (impact-first) with timelines

| # | Item | Pillar | Impact | Effort | Timeline | Status |
|---|---|---|---|---|---|---|
| P5 | FK + redundant indexes | DB | High (scale) | S | minutes | ✅ schema · ⏳ apply (db push) |
| — | Dashboard payments → `groupBy` | DB/payload | Med | S | done | ✅ landed + parity-verified |
| P3 | Dashboard appt aggregation | CPU/DB | High | M | done | ✅ landed + parity-verified on prod |
| P1 | Reports/analytics DB aggregation | CPU/DB | **Highest** | L | 3–4 d | 📋 plan 004 |
| P2 | Booking client search (un-unbound) | payload | **Highest** | M | 1.5–2 d | 📋 plan 003 |
| P4 | Staff directory aggregation | memory/DB | High | M | done | ✅ landed + parity-verified on prod |
| P6 | Convert-to-client indexed phone | DB | Med | S–M | 0.5 d | 📋 backlog |
| — | CI gate (typecheck+lint+test) | pipeline | Med | S | done | ✅ `.github/workflows/ci.yml` |
| — | Report computation caching | CPU | Med | S | 0.5 d (after P1) | 📋 |

**Total to clear the ranked list: ~8–10 engineering days**, sequenced: apply P5
indexes (now) → P3 + P4 + P6 (quick DB wins) → P2 (booking UX) → P1 (reports, the big
one, on top of the test baseline) → caching + CI gate.

## Landed this loop (performance) — all committed, pushed, parity-verified on prod
- **Dashboard payments** → `groupBy` (per-status sums/counts, not month-of-rows).
- **Dashboard appointment KPIs (P3)** → DB aggregates: completion split, completed-
  this-month, avg visit length, per-day visit bars (UTC→app-zone day buckets).
- **Staff directory (P4)** → per-staff DB aggregates (today / completed-this-month /
  completion-rate); the directory no longer loads every appointment per member.
- **FK + redundant-index optimization** in `schema.prisma` + ready-to-apply
  `prisma/perf-indexes.sql` (⏳ owner applies via db push).
- **Verification baseline** (Vitest, 21 tests incl. revenue + visits-summary parity).
- (From hardening) atomic appointment save, 2 supporting indexes, currency single-source.

## Remaining (scoped, not safely single-session)
- **P1 — reports/analytics rewrite (highest CPU):** a 2,400-line module consuming
  the 210-day appointment/message arrays across 8 periods + charts + AI-snapshot
  signatures. Needs a characterization-snapshot harness *first* (so the rewrite can
  prove byte-identical output) — that's why it's a focused ~3–4 day unit, not a
  rushed in-session change. Plan: [004](004-reports-dashboard-db-aggregation.md).
- **P2 — booking client search:** UI change (combobox) needing signed-in browser QA,
  which has no reusable test session yet. Plan: [003](003-booking-client-search.md).
- **P6, CI gate, report caching:** small, documented above.
