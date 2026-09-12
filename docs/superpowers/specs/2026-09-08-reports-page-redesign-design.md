# Reports Page Redesign — Design

## Summary

Redesign the authenticated Reports page from a single dense scroll into a tabbed workspace (**Overview / Staff / Demand**) that surfaces clinic-performance data the app already computes but never shows, and makes the existing charts/tables genuinely interactive instead of static. This supersedes AGENTS.md's current "Reports" section, which the owner has explicitly authorized discarding — that section documented a prior settled design, not a permanent constraint. AGENTS.md must be updated to describe the new design once it ships (see "Follow-up: AGENTS.md" below).

Scope is Reports only. No other page's layout changes as part of this work — a request to extend this richer/interactive visual language to Dashboard, Clients, Staff, Calendar, Inbox, and Settings surfaced during brainstorming but was explicitly deferred to separate, later design cycles per-page.

Revenue/financial reporting is explicitly **out of scope** for this pass (owner's choice) despite showing up as a top-tier metric in research — Reports currently has zero financial data and that stays true here; it's a natural candidate once Paddle billing lands.

## Why

The current Reports page (three-row layout: 3 KPI cards, Performance chart + AI insight, status donut + Highlights) is functionally sophisticated under the hood — real utilization math accounting for schedule blocks and DST, a full rule-based insight/scoring engine, per-staff load, demand windows, booking behavior — but almost none of that surfaces. The owner's feedback: the page feels basic, data feels "mushed together" rather than clearly divided, and the KPIs/charts/tables aren't interactive or "alive."

Research into clinic practice-management analytics (see Sources) confirms the underlying Vela model is already well-aligned with real-world practice: the 70–92% "healthy utilization" band `scorePeriod`/`buildWatch` already use in [reports.ts](../../../src/lib/reports.ts) matches the 70–85% band cited across multiple practice-management sources. The gap is presentation, not measurement — staff productivity, demand/booking patterns, and utilization are all metrics real clinics track closely, and Vela already computes equivalents for all three.

SaaS dashboard UX research favors progressive disclosure (3–5 headline KPIs, detail behind tabs/drill-down) over one long page, and recommends drill-down expand in place rather than navigate away. Both principles shape the structure below.

## Goals

- Surface staff performance and demand/booking patterns that are computed but currently hidden.
- Promote Estimated utilization from a buried Highlights line to a full headline KPI.
- Make the page feel interactive: sortable rows, a real day×hour heat-grid, inline drill-down, a previous-period comparison overlay on the main chart.
- Keep the existing rule-based/AI insight engine, status donut, and Performance chart — refine, don't replace.
- Keep everything gated behind the Pro plan, consistent with existing behavior (owner decision, this session).

## Non-goals (explicitly deferred)

- Revenue/financial reporting (owner: not now).
- Full side-by-side two-period comparison view (heavier than this pass; the lighter ghost-line overlay covers the immediate need).
- Filtering Reports by staff member or service.
- Export (CSV/PDF).
- Extending this visual language to any other page.

## Structure: three tabs

Same underline-tabs pattern already used on Client Detail and Staff Detail (`components/workspace/`), so it stays visually consistent with the rest of the app. The period selector (daily/weekly/monthly/custom) and the Refresh AI action stay in the page header, above the tabs, and apply across all three — switching tabs must not reset the selected period.

### Overview tab

- **KPI row: 4 cards** — Appointments, Completion rate, New clients, **Utilization** (new, promoted from Highlights). Utilization gets its own mini-chart like the other three.
- **Performance chart + AI insight** — unchanged in position/content, plus a previous-period ghost line (see "Chart comparison overlay" below).
- **Appointment status donut** — unchanged.
- **Highlights** — shrinks now that Staff/Demand have real homes; keeps only what doesn't fit those tabs (e.g. average visit length).

### Staff tab

Per-provider list, sourced from `diagnostics.staffLoad`:

- Sortable column headers (default sort: appointments, descending).
- Each row: square identity tile + name/role, appointment count, an inline horizontal utilization-load bar (share of total booked minutes), completion rate.
- Row click expands inline (accordion) with a brief recent-activity peek.
- A "View profile" link in the expanded row goes to the existing Staff Detail page — do not duplicate that page's content here.

### Demand tab

- **Day × hour heat-grid** — booking density across the period window, colored by intensity, hover a cell for the exact count. This is a genuinely new visualization, not a reskin of `demandWindows.busiestDays`/`busiestHours` (those are separate top-3 lists today; the heat-grid needs the full cross-tabulated matrix — see Data layer changes). The hour axis uses **4 fixed time-of-day bands** (e.g. early/morning, midday, afternoon, evening), not all 24 hours — 24 rows would be mostly empty at typical appointment volumes, and the mockup the owner approved showed a small handful of bands, not a full clock. For a daily period the grid naturally shows one meaningful day-column with the rest at zero — same graceful degradation `demandWindows` already has across period lengths today; no special-case needed.
- **Stats strip** below the grid: average lead time, same-day booking rate, unassigned appointment count.
- **Client mix** (active / at-risk / inactive / archived) moves here from its current home in `diagnostics.clientMix` — not currently rendered anywhere on the page today.

### Drill-down (applies across all three tabs)

Clicking a KPI card, a heat-grid cell, or a staff row expands an inline panel directly beneath it — accordion-style, pushes content down, no dialog and no page navigation. Only one panel open at a time per tab.

### Chart comparison overlay

The Performance chart (Overview tab) gains a light previous-period ghost line — dashed, low-opacity, same style already used for the "Completed" series — for a quick visual comparison without building a full side-by-side comparison UI.

## Data layer changes (`src/lib/reports.ts`)

Most of the underlying data already exists (`staffLoad`, `demandWindows`, `bookingBehavior`, `clientMix` are already computed in `buildPeriodDiagnostics`), but three pieces need real new logic, not just UI wiring:

1. **Day×time-band heat-grid matrix.** Today, `demandWindows` tracks `dayCounts` and `hourCounts` as separate aggregates (top-3 busiest days, top-3 busiest hours, independently). The heat-grid needs a cross-tabulated `Map<day, Map<band, count>>` (or equivalent flat array of `{ day, band, count }`), where `band` is one of the 4 fixed time-of-day bands (not raw hour), built from the same `scopedAppointments` loop already in `buildPeriodDiagnostics` — extend that loop rather than adding a second pass.
2. **Per-provider completion rate.** `staffLoad` currently tracks `appointments` and `bookedMinutes` per staff member but not completed vs. total. Extend the existing `staffCounts` map in `buildPeriodDiagnostics` to also track completed count per `staffMemberId`, then derive `completionRate` alongside `utilizationShare`.
3. **Previous-period chart series.** `ReportPeriodView.chart` only carries the current period's bucketed `points`/`completedValues`. Add a `previousValues: number[]` (or similar) built the same way against `window.previousStart`/`previousEnd` instead of `window.start`/`window.end`, reusing the existing per-bucket appointment-count logic.
4. **New KPI key.** Add `"utilization"` to `ReportKpi["key"]` and add the corresponding entry to each period's `kpis` array, using the already-computed `utilizationRate` and its existing delta (`deltas.utilization`, already threaded through `buildSnapshot`).

None of this needs new Prisma queries — everything is derived from `appointments`, which `buildPeriodDiagnostics`/`buildPeriodStats` already receive.

## Component structure

`src/components/reports/reports-overview.tsx` is already ~1,230 lines and this adds two new tabs' worth of UI — a good point to split rather than grow further:

- `reports-overview.tsx` — becomes the tab container: header, period selector, tab bar, renders the active tab.
- `overview-tab.tsx` — today's KPI row / chart / donut / highlights content (moved, not rewritten).
- `staff-tab.tsx` — new: sortable staff list + inline drill-down.
- `demand-tab.tsx` — new: heat-grid + stats strip + client mix.

Shared bits (KPI card, drill-down accordion shell, mini-chart primitives) stay in `reports-overview.tsx` or move to a small shared file if genuinely reused across 2+ tabs — decide during implementation based on actual duplication, not upfront.

## Plan gating

All three tabs stay behind the Pro plan, matching existing behavior — Basic continues to see the current polished upgrade state for Reports as a whole (owner decision, this session). No change needed to `isProBusinessPlan()` gating logic itself, just ensure the new tabs render inside the existing Pro-gated branch.

## Testing

- Unit tests (co-located `*.test.ts`, matching `reports.test.ts`'s existing style) for the three new/changed pure functions: heat-grid matrix builder, per-provider completion rate, previous-period series.
- Signed-in browser QA against the existing Vela Test Clinic seed data (see `qa-data-seeding` memory) for all three tabs, sort behavior, drill-down expand/collapse, and the ghost-line overlay.
- No new Prisma migrations, so no DB-level testing needed beyond the existing suite staying green.

## Follow-up: AGENTS.md

Once this ships, AGENTS.md's "Reports" section (under Page Direction) needs to be rewritten to describe the tabbed structure as the new settled design, replacing the current three-row description. This is a documentation update, not a design decision — do it as part of finishing this work, not a separate ask.

## Sources

- [Clinic KPI Benchmarks for 2026](https://omnimd.com/blog/clinic-kpi-benchmarks/)
- [Clinic KPI Benchmarks 2026 — RCM Matter](https://rcmmatter.com/blogs/guides/clinic-kpi-benchmarks)
- [Key Performance Indicators for Modern Therapy Clinics](https://www.sprypt.com/blog/measuring-what-matters-key-performance-indicators-modern-therapy-clinics)
- [What KPIs and Analytics Are Used on Practice Management Dashboards?](https://www.inetsoft.com/info/practice-management-dashboard-kpis-and-analytics/)
- [5 Metrics Every Practice Administrator Needs to Track](https://curogram.com/blog/practice-administrator-kpis-metrics)
- [SaaS Analytics Dashboard UX: Real Examples & Patterns (2026)](https://www.saasui.design/blog/saas-analytics-reporting-dashboard-ux-patterns)
- [SaaS Dashboard UX Patterns: Complete 2026 Guide](https://www.gitnexa.com/blogs/saas-dashboard-ux-patterns)
