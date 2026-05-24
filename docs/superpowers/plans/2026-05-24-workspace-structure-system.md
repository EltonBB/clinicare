# Workspace Structure System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and apply a consistent Vela workspace structure system across authenticated pages using the supplied reference image as layout direction only.

**Architecture:** Add shared workspace layout primitives for page shells, headers, KPI grids/cards, main/rail grids, cards, rail stacks, tables, and empty states. Then adopt those primitives in the dashboard model first, followed by reports, records/directories, forms, onboarding/auth, loading, and status states without touching data, auth, routes, server actions, validation, or business behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, existing Lucide icons, existing Vela design tokens.

---

### Task 1: Shared Workspace Components

**Files:**
- Create: `src/components/workspace/workspace-layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/workspace/create-page-shell.tsx`

- [x] Create `WorkspacePage`, `WorkspaceHeader`, `WorkspaceKpiGrid`, `WorkspaceKpiCard`, `WorkspaceMainGrid`, `WorkspaceCard`, `WorkspaceRail`, `WorkspaceTable`, and `WorkspaceEmptyState`.
- [x] Add consistent spacing, radius, row-height, rail width, card shadow, and compact table utilities through the shared components.
- [x] Tighten shell/sidebar/topbar rhythm without changing navigation, search, account, notification, or auth behavior.
- [x] Update `CreatePageShell` to use `WorkspacePage`/`WorkspaceHeader` so create/edit forms align with workspace pages.

### Task 2: Dashboard Layout Model

**Files:**
- Modify: `src/components/dashboard/dashboard-overview.tsx`
- Modify: `src/components/dashboard/dashboard-unread-card.tsx`

- [x] Replace local KPI card/panel wrappers with shared workspace components.
- [x] Make KPI cards equal height with fixed icon/title/value/helper placement.
- [x] Standardize Today appointments table-like rows, right rail cards, and compact empty states.
- [x] Preserve dashboard customization, widget visibility, links, and unread message behavior.
- [x] Run `npm run lint`.

### Task 3: Reports And Client Detail

**Files:**
- Modify: `src/components/reports/reports-overview.tsx`
- Modify: `src/components/clients/client-details-page.tsx`

- [x] Convert Reports to the shared page/header/KPI/grid/card/rail primitives.
- [x] Keep Reports chart/range/period/refresh logic unchanged while improving card row alignment.
- [x] Convert Client detail header, stats, tab panels, right rails, tables, and empty states to shared primitives where practical.
- [x] Preserve client tab state, record mutations, uploads, payments, messages, and navigation.
- [x] Run `npm run lint`.

### Task 4: Directory, Staff, Calendar, Inbox, Settings

**Files:**
- Modify: `src/components/calendar/calendar-workspace.tsx`
- Modify: `src/components/clients/clients-workspace.tsx`
- Modify: `src/components/staff/staff-workspace.tsx`
- Modify: `src/components/staff/staff-details-page.tsx`
- Modify: `src/components/inbox/inbox-workspace.tsx`
- Modify: `src/components/settings/settings-workspace.tsx`

- [x] Apply shared headers, KPI grids, cards, main/rail grids, rail stacks, and tables.
- [x] Normalize table row heights and action placement in Clients and Staff directories.
- [x] Normalize Calendar right rail and selected-day panels without changing calendar placement math.
- [x] Keep Inbox messaging and conversion behavior unchanged while tightening columns and empty state.
- [x] Keep Settings save/connect/upload behavior unchanged while aligning sections and side nav.
- [x] Run `npm run lint`.

### Task 5: Forms, Onboarding, Auth, Loading/Error States

**Files:**
- Modify: `src/components/calendar/new-appointment-form.tsx`
- Modify: `src/components/clients/new-client-form.tsx`
- Modify: `src/components/clients/edit-client-form.tsx`
- Modify: `src/components/staff/new-staff-form.tsx`
- Modify: `src/components/onboarding/onboarding-flow.tsx`
- Modify: `src/components/auth/login-form.tsx`
- Modify: `src/components/auth/sign-up-form.tsx`
- Modify: `src/components/auth/forgot-password-form.tsx`
- Modify: `src/components/auth/reset-password-form.tsx`
- Modify: `src/components/auth/auth-confirm-screen.tsx`
- Modify: `src/app/(workspace)/loading.tsx`

- [x] Align form sections, labels, inputs, action rows, and empty/error states with the shared workspace rhythm.
- [x] Keep all field names, controlled values, server actions, validation attributes, and submit/cancel/delete behavior unchanged.
- [x] Compact onboarding cards and auth forms while preserving the current Vela brand treatment.

### Task 6: Verification And Status

**Files:**
- Modify: `PROJECT_STATUS.md`

- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Verify protected desktop/mobile routes with Playwright; record auth-session limits if protected pages redirect to login.
- [x] Update `PROJECT_STATUS.md` with changed structure, verification, known visual QA limit, and next task.
