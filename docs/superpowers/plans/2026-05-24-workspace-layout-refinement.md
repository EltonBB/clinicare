# Workspace Layout Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish applying the shared Vela workspace layout system across authenticated pages so cards, tables, rails, empty states, and responsive page structure feel consistent.

**Architecture:** Refine the existing shared primitives first, then replace remaining page-specific card/table/empty-state structures in priority pages. Keep all data, auth, server actions, form field names, validation, routing, and business behavior untouched.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, existing shadcn-style primitives, Lucide icons, existing Vela tokens.

---

### Task 1: Shared Primitive Refinements

**Files:**
- Modify: `src/components/workspace/workspace-layout.tsx`
- Modify: `src/components/layout/app-shell.tsx`

- [x] Add compact sizing controls to `WorkspaceEmptyState` and `WorkspaceKpiCard` so pages can remove excess vertical whitespace without creating local one-off styles.
- [x] Add body class support to `WorkspaceTable` so directories can standardize row divisions and mobile stacking.
- [x] Tighten the app shell sidebar bottom clinic/account/plan rhythm without changing navigation, auth, search, notification, or account behavior.
- [x] Run `npm run lint`.

### Task 2: Reports Priority Pass

**Files:**
- Modify: `src/components/reports/reports-overview.tsx`

- [x] Reorder the Reports hierarchy to read as KPI row, main chart plus compact AI summary rail, secondary cards, then detailed operational sections.
- [x] Make the AI insights rail compact with bounded content and concise cards.
- [x] Replace large sparse chart bodies with compact `WorkspaceEmptyState` when data is zero or unavailable.
- [x] Keep period, date range, refresh, snapshot, AI/fallback, and metric calculations unchanged.
- [x] Run `npm run lint`.

### Task 3: Dashboard And Sidebar Polish

**Files:**
- Modify: `src/components/dashboard/dashboard-overview.tsx`
- Modify: `src/components/dashboard/dashboard-unread-card.tsx`
- Modify: `src/components/layout/app-shell.tsx`

- [x] Reduce dashboard empty-state height by using compact shared empty states.
- [x] Align right rail cards with compact `WorkspaceCard` padding and consistent internal row spacing.
- [x] Keep dashboard customization, widget visibility, links, unread message behavior, and quick actions unchanged.
- [x] Run `npm run lint`.

### Task 4: Client Detail Shared Layout Pass

**Files:**
- Modify: `src/components/clients/client-details-page.tsx`

- [x] Use shared `WorkspaceMainGrid`, `WorkspaceRail`, `WorkspaceCard`, `WorkspaceTable`, and compact `WorkspaceEmptyState` in the client detail overview and tab content where practical.
- [x] Balance overview cards for next appointment, recent visits, payments, medical notes, documents, messages, and profile rail.
- [x] Remove scattered local card styles that create mismatched heights while preserving all record actions, uploads, payment rows, messages, and tab state.
- [x] Run `npm run lint`.

### Task 5: Directories, Calendar, Inbox, Settings, Forms

**Files:**
- Modify: `src/components/clients/clients-workspace.tsx`
- Modify: `src/components/staff/staff-workspace.tsx`
- Modify: `src/components/calendar/calendar-workspace.tsx`
- Modify: `src/components/inbox/inbox-workspace.tsx`
- Modify: `src/components/settings/settings-workspace.tsx`
- Modify: `src/components/calendar/new-appointment-form.tsx`
- Modify: `src/components/clients/new-client-form.tsx`
- Modify: `src/components/clients/edit-client-form.tsx`
- Modify: `src/components/staff/new-staff-form.tsx`

- [x] Standardize Clients and Staff directory search/filter bars, table header height, row height, and action column alignment with shared table props.
- [x] Tighten Calendar rail, selected-day empty states, and panel rhythm without changing calendar placement math.
- [x] Tighten Inbox shell and empty conversation state while preserving message polling, conversion, send, read, and delete behavior.
- [x] Wrap form sections in `WorkspaceCard` where the section is visual-only and preserve all field names, submit actions, validation attributes, and buttons.
- [x] Run `npm run lint`.

### Task 6: Verification, Browser Smoke, Status

**Files:**
- Modify: `PROJECT_STATUS.md`
- Modify: `docs/superpowers/plans/2026-05-24-workspace-layout-refinement.md`

- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Start or verify the dev server preview.
- [x] Use Playwright desktop and mobile checks for public/auth pages and protected-route redirects; note that signed-in workspace visual QA requires a real session if the browser redirects to `/login`.
- [x] Update `PROJECT_STATUS.md` with changed files, verification, known visual QA limit, and next task.
- [x] Mark this plan complete.
