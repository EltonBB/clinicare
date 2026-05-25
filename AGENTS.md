<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may differ from older Next.js versions.

Before writing or changing code that touches routing, server/client components, caching, middleware, data fetching, server actions, layouts, or app directory behavior, read the relevant guide in:

`node_modules/next/dist/docs/`

Heed deprecation notices and avoid relying on older Next.js assumptions.
<!-- END:nextjs-agent-rules -->

# Vela / Clinicare Agent Instructions

## Mandatory Startup Workflow

At the start of every new chat or task in this project:

1. Read this `AGENTS.md` file first.
2. Read `PROJECT_STATUS.md` immediately after.
3. Inspect the repo enough to validate the status file against the actual code before planning or coding.
4. Reply with a short project summary covering:
   - what Vela / Clinicare is
   - what has been completed
   - where the project currently stands
   - the next recommended task
5. Continue from that context without requiring old conversation history.

If `PROJECT_STATUS.md` is missing, create a plan to restore it before doing feature work.

---

## Product Identity

Vela / Clinicare is a SaaS workspace for clinics and appointment-based businesses.

It is a clinic operating system designed to help a business manage:

- onboarding
- clinic branding
- staff
- clients/patients
- appointments
- calendar scheduling
- WhatsApp inbox communication
- reminders
- documents and client history
- payments/billing surfaces
- reports
- AI-assisted operational insights

The product goal is to help clinic owners and staff run daily operations from one calm, organized workspace.

Vela should hide operational complexity. Customers should not need to understand the underlying providers, technical integrations, database structure, or automation logic.

---

## Core Product Vision

Vela should feel like:

- a simple clinic operating system
- a clean daily workspace
- a premium SaaS product
- calm and structured
- fast to understand
- useful without being overwhelming

The app should not feel like:

- a generic admin dashboard
- a cluttered CRM
- a developer tool
- a collection of disconnected cards
- a technical provider interface
- a page full of widgets just because data exists

The core product idea is:

> Vela gives clinics one organized place to manage the day: appointments, clients, staff, conversations, and performance.

Every page and feature should support that idea.

---

## Product Experience Principle

Every screen should answer one clear user question.

- Dashboard: What needs my attention today?
- Calendar: What is scheduled and what needs to be booked?
- Clients: How do I find and manage client records quickly?
- Client detail: What do I need to know about this client?
- Staff: Who is working and what is their workload?
- Staff detail: What do I need to know about this staff member?
- Inbox: What conversations need a reply?
- Reports: What changed, why does it matter, and what should I do next?
- Settings: How do I configure the workspace clearly?

Every component must have a clear purpose.

If two cards, panels, or sections show the same information, merge them or remove one.

If a component does not help the user make a decision, take action, or understand context, it probably does not belong on the page.

---

## UI and Layout Philosophy

Vela’s interface should be:

- simple but rich
- clean but not empty
- compact but readable
- structured but not rigid
- modern but not flashy
- premium but practical

Prefer:

- fewer components with more meaning
- strong page hierarchy
- clear grids
- compact cards
- consistent spacing
- consistent tables
- consistent forms
- useful side panels
- focused empty states
- simple language
- restrained use of visual effects

Avoid:

- duplicated stats
- unnecessary cards
- oversized empty states
- disconnected right rails
- random card heights
- random one-off grid ratios
- dashboard clutter
- huge unused whitespace
- full-width forms when not needed
- exposing internal/provider details to customers

The UI UX Pro Max skill may be used for UI/UX review and design work, but AGENTS.md remains the source of truth for Vela-specific product direction, layout types, brand rules, and functionality boundaries.

---

## Brand Direction

Preserve the Vela brand unless explicitly asked otherwise.

Brand feel:

- modern healthcare
- calm technology
- organized operations
- premium SaaS
- trustworthy and clean

Use the current Vela logo, color system, gradient, typography direction, and clinic SaaS identity.

Use brand accents intentionally:

- primary actions
- active navigation
- key highlights
- important status/insight elements

Do not overuse gradients or make the app feel decorative.

Most of the workspace should remain clean, light, readable, and operational.

---

## Layout Type System

Classify authenticated pages by layout type before making UI changes.

### A. Overview Dashboard Layout

Used for:

- Dashboard
- Reports when Pro is active

Purpose:

- Show high-level operational information.
- Highlight what needs attention.
- Use compact KPI cards and clear content sections.
- Avoid duplicated summary cards.

### B. Directory/List Layout

Used for:

- Clients
- Staff
- similar list pages

Purpose:

- Help users find, filter, and act on records quickly.
- The table/list should be the main focus.
- KPIs should be compact and only included if useful.
- Avoid unnecessary right rails.

### C. Detail/Profile Layout

Used for:

- Client detail
- Staff detail
- appointment detail/edit where applicable

Purpose:

- Present one record clearly.
- Use a strong detail header.
- Use tabs or grouped sections.
- Keep cards aligned and purposeful.
- Avoid scattered, duplicated, or mismatched cards.

### D. Operational Workspace Layout

Used for:

- Calendar
- Inbox

Purpose:

- Support active work.
- Calendar should focus on scheduling.
- Inbox should focus on communication.
- Side panels are allowed only when they add useful context.

### E. Form Layout

Used for:

- New/edit client
- New/edit staff
- New/edit appointment
- settings forms where appropriate

Purpose:

- Make data entry calm and easy.
- Use centered form containers.
- Use clear sections.
- Align save/cancel actions consistently.

### F. Settings Layout

Used for:

- Settings
- onboarding/setup areas where appropriate

Purpose:

- Organize configuration into clear sections.
- Avoid dashboard-like clutter.
- Keep forms readable and focused.

---

## Page Direction

### Dashboard

The Dashboard should answer:

> What needs my attention today?

Recommended structure:

- page header with date and main action/customize action
- compact KPI row
- today’s schedule as the main work card
- next appointment as a compact context card
- command center card that merges quick actions and today summary
- recent activity
- compact clinic health/performance summary

Avoid:

- repeated appointment counts
- separate cards that say the same thing
- oversized empty panels
- too many widgets competing for attention

---

### Calendar

The Calendar should focus on scheduling.

Recommended structure:

- page header with view/date controls
- calendar grid as the main focus
- one selected-day or appointment context panel if useful
- compact legend or helper information only where needed

Avoid:

- duplicated lower summary panels
- too many side cards
- calendar grid becoming visually secondary

---

### Clients Directory

The Clients page should be table-first.

Recommended structure:

- page header with primary action
- compact KPIs only if useful
- search/filter toolbar
- main data table/list
- compact supporting summary only if it adds distinct value

Avoid:

- unnecessary right rails
- duplicated summary cards
- table data split across too many panels

---

### Client Detail

The Client Detail page should feel like a clean client/patient profile workspace.

Recommended structure:

- detail header with name, status, contact, and actions
- tabs for major areas
- overview with balanced cards
- next appointment
- recent visits
- payment summary
- health/medical notes
- documents
- messages
- activity timeline where useful

Avoid:

- scattered cards
- duplicated information
- random side rails
- uneven card sizes

---

### Staff Directory

The Staff page should be table-first like Clients.

Recommended structure:

- page header with primary action
- compact KPIs only if useful
- search/filter toolbar
- main staff table/list
- compact schedule/coverage summary only if useful

Avoid:

- unnecessary right rails
- repeated staff summaries
- over-cluttered tables

---

### Staff Detail

The Staff Detail page should feel like a clean profile/performance workspace.

Recommended structure:

- detail header with name, role, status, contact, and actions
- tabs or grouped sections
- schedule
- appointments
- performance
- profile details
- compact record health only if useful

Avoid:

- duplicated operational summaries
- too many small cards
- scattered profile information

---

### Inbox

The Inbox should feel like a communication workspace.

Recommended structure:

- conversation list
- active conversation/thread
- compact client/contact context panel if a conversation is selected
- inline reply/actions

Avoid:

- dashboard-style metric clutter
- unrelated summary cards
- treating Inbox like a generic list page

---

### Reports

Reports should be a clean analytics or upgrade experience.

If the workspace is on Basic:

- show a polished upgrade state
- explain what Pro unlocks simply
- avoid overwhelming the user with unavailable analytics UI

If Reports are active:

- header with controls
- KPI row
- performance chart
- client/status mix
- compact AI insights section
- operational metrics
- appointment status
- demand windows
- staff load
- detailed breakdown

Avoid:

- tall disconnected AI rails
- masonry-like random card placement
- large blank chart areas when no data exists

---

### Settings

Settings should feel calm and form-focused.

Recommended structure:

- settings navigation
- clear form sections
- business details
- appearance
- working hours
- staff link/summary
- WhatsApp configuration
- reminders
- billing

Avoid:

- dashboard clutter
- full-width forms when not needed
- exposing provider implementation details

---

### Forms

Forms should be easy and focused.

Recommended structure:

- back link
- page title
- centered form container
- sectioned form cards
- consistent field spacing
- clear save/cancel actions

Avoid:

- stretched full-width forms
- inconsistent field alignment
- too many unrelated sections on one screen

---

## UI Component Philosophy

Use a clear component hierarchy.

### Primitives

Use existing UI primitives for:

- Button
- Input
- Select
- Dialog
- Dropdown
- Badge
- Tooltip
- Tabs
- Avatar
- Checkbox
- Textarea

Do not rebuild primitives from scratch unless the current primitive is broken or too limiting.

### Layout and Product Components

Use custom Tailwind-based components for:

- app frame
- sidebar
- topbar
- workspace page wrapper
- page headers
- toolbars
- metric grids
- metric cards
- section cards
- side panels
- tables
- empty states
- detail headers
- detail tabs
- form sections
- activity lists
- action lists
- summary cards

### Component Rules

- Do not scatter new components into random folders.
- Do not create a component unless it is reused or significantly simplifies a large file.
- Prefer shared layout components over repeated JSX.
- Prefer feature-specific components for logic-heavy UI.
- Keep UI-only components presentational where possible.
- Keep data fetching and business logic outside presentational UI components where practical.

---

## Recommended Frontend Folder Direction

Use this structure for new or refactored UI components when practical:

```txt
src/components/
  ui/
    shadcn/base primitives and small reusable UI primitives

  layout/
    app shell
    sidebar
    topbar
    navigation
    workspace frame

  workspace/
    WorkspacePage
    WorkspaceHeader
    WorkspaceToolbar
    MetricGrid
    MetricCard
    ContentGrid
    SectionCard
    SidePanel
    DataTable
    EmptyState
    DetailHeader
    DetailTabs
    FormSection
    ActionList
    SummaryCard
    ActivityList

  dashboard/
    dashboard-specific presentational components

  clients/
    client directory and client detail components

  staff/
    staff directory and staff detail components

  calendar/
    calendar-specific components

  inbox/
    inbox-specific components

  reports/
    reports-specific components

  settings/
    settings-specific components
