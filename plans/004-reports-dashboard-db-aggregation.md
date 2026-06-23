# 004 — Reports + dashboard DB aggregation (stop pulling 7 months of rows into Node)

**Base commit:** `fcd3eb9` · **Category:** performance / scaling · **Effort:** L ·
**Risk:** MED (parity-critical) · **Depends on:** 005 (characterization tests are
the safety net for "the numbers must not change").

## Why this matters

### Reports (the heavy one)
- `src/lib/report-data.ts:~38` fetches **every appointment** in a 210-day (or
  wider, for custom ranges) window into memory; `:~72` fetches every message in the
  window.
- `src/lib/reports.ts` then runs `buildPeriodStats` ~8 times (each ~5 `.filter()`
  passes over the full array) and the chart builders re-`.filter()` the array once
  per bucket (~21 passes), plus `toChartData` again — **40+ linear passes** per
  Reports render, and per Pro business in the analytics cron (concurrency 3,
  `maxDuration = 300`). At a busy clinic (tens of thousands of appointments over 7
  months) this dominates the page cost and the cron's per-tenant time budget.

### Dashboard (smaller, same shape)
- `src/app/(workspace)/dashboard/page.tsx:~171` fetches all ~30 days of appointment
  rows (`status/startAt/endAt`); `src/lib/dashboard.ts:~358-392` derives completion
  rate, completed-this-month, average duration, and the 14-day bars by `.filter()`/
  `.reduce()` in JS. On the most-visited page, every load transfers the month of
  rows to produce ~5 scalars + 14 bar counts.

The point-in-time client mix was already correctly moved to a `groupBy`
(`report-data.ts:~120`) — follow that precedent for the appointment/message
counts. The supporting index `@@index([businessId, status, startAt])` already
exists.

## The fix — push counts/sums into Postgres

Replace the bulk fetch + JS reduction with DB aggregates:

- **Appointment status splits** (completion rate, status donut, completed counts):
  `prisma.appointment.groupBy({ by: ["status"], where: { businessId, startAt: { gte, lt } }, _count: true })`.
- **Per-bucket time series** (daily/weekly/monthly bars, the 14-day dashboard bars):
  date-bucketed counts. Prefer `$queryRaw` with `date_trunc(...)` **at the app time
  zone** (`AT TIME ZONE`), or one `count` per bucket if the bucket count is small
  and bounded. The bucket day-key boundaries MUST match `lib/time-zone.ts`'s zoned
  day windows exactly — this is the parity risk.
- **Average visit length:** `_avg` on `(endAt - startAt)` for completed rows, or a
  single bounded fetch for just that metric.
- **Message direction counts:** `prisma.message.groupBy({ by: ["direction"], where: { ... } })`.

Keep JS only for *shaping* the aggregate results into the view model. The cron
(`analytics-ai` / `report-data`) shares `getReportWorkspaceData` across all 3
periods (already good) — make it return aggregates, not raw arrays.

## Verification — parity is the whole game

- `npm run typecheck && npm run lint && npm run build` green.
- **Characterization tests first (plan 005):** snapshot the current Reports +
  dashboard view models for a seeded clinic with known data (cover cancelled-
  excluded rules, empty buckets, DST boundary days, custom ranges). The refactor
  must reproduce those snapshots **byte-for-byte**. Do not ship without this — there
  is no other guard against a silent metric regression.
- Spot-check timezone day boundaries: an appointment at 23:30 local on a DST-change
  day must land in the same bucket before and after.

## Out of scope

- Don't change the Reports/dashboard UI or the view-model *shape* — only the data
  source behind it.
- Don't add a caching layer in this plan (separate optimization once aggregates land).
