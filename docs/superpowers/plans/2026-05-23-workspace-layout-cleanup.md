# Workspace Layout Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Tighten authenticated Vela workspace layout density, alignment, card sizing, right rails, empty states, and responsive behavior without changing functionality.

**Architecture:** Keep the current Vela visual system and existing page/component ownership. Make layout-only changes in shared shell/form/card surfaces first, then apply page-specific spacing and natural-height fixes to Reports and the authenticated workspace pages.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, existing Vela UI primitives.

---

### Task 1: Shared Workspace Rhythm

**Files:**
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/workspace/create-page-shell.tsx`

- [x] Reduce shared card radius/padding slightly while preserving the current Vela surface treatment.
- [x] Tighten authenticated shell page padding so desktop, tablet, and mobile pages use a consistent rhythm.
- [x] Remove the tall create/edit shell minimum height and reduce heading/breadcrumb spacing so forms size to content.
- [x] Verify shared changes do not alter auth, data fetching, routing, server actions, or form submission behavior.

### Task 2: Reports Priority Cleanup

**Files:**
- Modify: `src/components/reports/reports-overview.tsx`

- [x] Tighten Reports top spacing, KPI cards, and control wrapping.
- [x] Reduce the performance chart height and make the chart summary cells compact.
- [x] Make Client status mix and Appointment status use compact donut/legend layouts that stack cleanly on smaller widths.
- [x] Balance Operational metrics, Appointment status, and Detailed breakdown with consistent internal spacing and compact rows.
- [x] Align the AI insight rail with the main grid using natural card heights, smaller rail padding, and compact insight blocks.
- [x] Keep all existing report state, period selection, range analysis, refresh, and rendering logic unchanged.

### Task 3: Workspace Page Cleanup

**Files:**
- Modify: `src/components/dashboard/dashboard-overview.tsx`
- Modify: `src/components/calendar/calendar-workspace.tsx`
- Modify: `src/components/clients/clients-workspace.tsx`
- Modify: `src/components/clients/client-details-page.tsx`
- Modify: `src/components/staff/staff-workspace.tsx`
- Modify: `src/components/staff/staff-details-page.tsx`
- Modify: `src/components/inbox/inbox-workspace.tsx`
- Modify: `src/components/settings/settings-workspace.tsx`

- [x] Normalize outer page `space-y` and grid gaps around authenticated workspace pages.
- [x] Compact KPI cards, page panels, right rails, empty states, and table rows without hiding useful context.
- [x] Remove unnecessary fixed/min heights, especially the Inbox message shell `min-h-[700px]`, replacing it with responsive natural sizing.
- [x] Make right rails use consistent widths and `content-start`/natural height behavior so panels stay visually connected to main content.
- [x] Preserve every existing link, button handler, client state update, form control, and action call.

### Task 4: Create/Edit Form Density

**Files:**
- Modify: `src/components/calendar/new-appointment-form.tsx`
- Modify: `src/components/clients/new-client-form.tsx`
- Modify: `src/components/clients/edit-client-form.tsx`
- Modify: `src/components/staff/new-staff-form.tsx`

- [x] Tighten form section padding, field grid gaps, textarea minimum heights, empty states, and action row spacing.
- [x] Preserve all field names, default values, controlled values, validation attributes, form actions, and submit/cancel/delete behavior.

### Task 5: Verification And Status

**Files:**
- Modify: `PROJECT_STATUS.md`

- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Start or reuse the local dev server and inspect affected workspace routes at desktop and mobile widths.
- [x] Record the completed cleanup, verification results, known auth-limited visual QA note, and next recommended task in `PROJECT_STATUS.md`.
