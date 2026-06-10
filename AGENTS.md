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
3. Read `ROADMAP.md` for strategy: market sequencing, compliance plan, messaging channels, and the Azure migration.
4. Inspect the repo enough to validate the status file against the actual code before planning or coding.
5. Reply with a short project summary covering:
   - what Vela / Clinicare is
   - what has been completed
   - where the project currently stands
   - the next recommended task
6. Continue from that context without requiring old conversation history.

If `PROJECT_STATUS.md` is missing, create a plan to restore it before doing feature work.

---

## Document Map

| File | Role | Wins conflicts about |
|---|---|---|
| `AGENTS.md` (this file) | Product direction, UX/layout types, brand, product boundaries | What to build and how it should look/feel |
| `ROADMAP.md` | Strategy: market, compliance, messaging channels, build order, Azure migration | Where the project is going and why |
| `CLAUDE.md` | Technical layer: stack, commands, architecture, code conventions | How to build it in this codebase |
| `PROJECT_STATUS.md` | Running log: completed work, known issues, next priorities | What is already done / currently broken |

The root `README.md` is a short human-facing overview — these four files remain authoritative for agents.

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

## Strategic Context (locked decisions — see ROADMAP.md for full detail)

- **Market sequencing:** free pilot to ~50 **Kosovo** clinics first, then **US-first**. Europe/GDPR is low priority.
- **Compliance:** **HIPAA is the primary target.** The app must be HIPAA-ready before the first US clinic. App-level safeguards (audit logging, auto-logoff, role-based/minimum-necessary access) are built **now, alongside features** — never retrofitted later.
- **Infrastructure:** stay on the current stack (Supabase / Vercel / Twilio / OpenAI) until the product is done, then one contained **Azure migration**. Features must stay behind the provider seams defined in CLAUDE.md so that swap stays cheap.
- **Pilot data is non-PHI by design.** Never design a feature that puts clinical detail into SMS/WhatsApp messages or third-party services.

What this means for everyday product decisions:

- Privacy and trust are selling points — marketing and in-app copy should reflect a privacy-conscious, compliance-serious product.
- Outbound patient messages carry **minimum-necessary content**: name and appointment time, never diagnoses, treatments, or other clinical detail.
- AI features are positioned as **AI-assisted operational insights** — never medical advice or clinical decision-making.

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
- Marketing pages: Why should my clinic use Vela?

Every component must have a clear purpose.

If two cards, panels, or sections show the same information, merge them or remove one.

If a component does not help the user make a decision, take action, or understand context, it probably does not belong on the page.

---

## Plans, Billing, and Feature Gating

- Plan state lives on the workspace (`Business`): **Basic** and **Pro** (`isProBusinessPlan()` gates Pro features).
- Full Reports analytics is the flagship Pro feature. On Basic, Reports shows a polished upgrade state — never a degraded or broken analytics page.
- Billing will run on **Paddle**. `/checkout` currently detects plan context (first purchase / current plan / upgrade / downgrade / reactivation) but the payment session, webhooks, and plan activation are **not implemented yet**. Keep the final payment button reserved for the Paddle handoff — never fake a successful purchase or activate a plan without real payment state.
- Pricing/plan copy lives on the public Pricing page and must stay consistent with the in-app plan card and checkout summary.

---

## Messaging and Communication Rules

- **Channel plan** (ROADMAP.md): pilot uses Resend (email), Twilio (SMS), and Baileys WhatsApp (Kosovo-only, disposable, isolated); after the Azure migration these swap to Azure Communication Services and official WhatsApp.
- All outbound messaging must flow through the messaging abstraction (`sendMessage(channel, payload)` — ROADMAP Step 1). Never call a provider directly from feature code.
- **Minimum-necessary content** on every patient-facing message: name + appointment time. No clinical details over SMS/WhatsApp, ever.
- **Customer-facing language hides providers.** Never surface Twilio, Meta, Supabase, Prisma, Baileys, or OpenAI names, internals, or raw errors in UI. Connection states, errors, and settings use simple product language with support-friendly fallbacks.

---

## UI and Layout Philosophy

Vela's interface should be:

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

Concrete brand system (locked through prior review passes):

- **Gradient:** cobalt → light blue, `#0A22FF` → `#64B6FF`. This palette drives design tokens, gradient utilities, marketing highlights, chart colors, and the default onboarding accent.
- **Assets:** `public/brand/vela-icon.svg` and `public/brand/vela-logo.pdf`. The brand mark sits directly beside the "Vela" wordmark with **no bordered icon tile** on landing, auth, or workspace surfaces.
- **Typography:** the app font stack prioritizes the brand `Metal Reg-2` / Metal family when available locally.
- **Icon tiles and active states are flat:** white bordered tiles, not gradient-filled blue tiles or blue shadow pills. Heavy blue shaded treatments were deliberately removed — do not reintroduce them.

Use brand accents intentionally:

- primary actions
- active navigation
- key highlights
- important status/insight elements

Do not overuse gradients or make the app feel decorative. Most of the workspace should remain clean, light, readable, and operational.

---

## Layout Type System

Classify pages by layout type before making UI changes. The shared workspace primitives (`src/components/workspace/`) enforce these types — build from them, not bespoke JSX.

### A. Overview Dashboard Layout

Used for: Dashboard; Reports when Pro is active.

- Show high-level operational information; highlight what needs attention.
- Compact KPI row + clear content sections.
- No duplicated summary cards.

### B. Directory/List Layout

Used for: Clients, Staff, similar list pages.

- The table/list is the main focus: toolbar above, primary table, compact summary cards **below** the table instead of right rails.
- KPIs compact and only if useful.

### C. Detail/Profile Layout

Used for: Client detail, Staff detail, appointment detail/edit where applicable.

- One record presented clearly: strong detail header, underline tabs or grouped sections.
- Overview tabs use a left contextual/profile column plus main content grid.
- Cards aligned and purposeful — no scattered, duplicated, or mismatched cards.

### D. Operational Workspace Layout

Used for: Calendar, Inbox.

- Support active work. Calendar focuses on scheduling; Inbox on communication.
- Side panels only when they add useful context.

### E. Form Layout

Used for: New/edit client, staff, appointment; settings forms where appropriate.

- Calm data entry: back link, page title, centered form container, sectioned form cards, consistent field spacing, aligned save/cancel.

### F. Settings Layout

Used for: Settings; onboarding/setup areas where appropriate.

- Configuration in clear sections; readable, focused forms; no dashboard-like clutter.

### G. Marketing Page Layout

Used for: public `/`, `/product`, `/pricing`, `/about`, `/contact`, `/checkout`, legal pages.

- Product-led storytelling on the shared marketing shell: hero, feature sections, CTAs.
- Code-native Vela workspace mockups with **sample data only** — never live customer data, never raw screenshots with draft labels.
- Mobile-safe responsive structure; CTAs route to `/sign-up`, `/login`, `/pricing`, `/product`, `/contact`, and legal pages.

---

## Page Direction

These reflect the **settled** designs after many review passes. Do not re-invent these structures; refine within them.

### Dashboard

Answers: *What needs my attention today?*

- Page header with date and main action/customize action; customization actually hides/shows sections.
- Compact KPI row.
- **Today's appointments as the primary work card**, with paired secondary grids (schedule, activity, clinic health).
- A merged **Command center** rail (quick actions + today summary + glance/messages) — not separate quick-action and summary cards.
- Constrained content frame with a narrower command rail — not an over-wide layout.

Avoid: repeated appointment counts, cards that say the same thing, oversized empty panels, too many widgets competing for attention.

### Calendar

Focus: scheduling.

- Page header with view/date controls plus a direct date-jump control.
- Calendar grid as the main focus; schedule blocks render as blocked time.
- Selected-day/appointment context lives in the **side panel** — no duplicated lower summary panels.
- Utilization derives from the selected view and saved business hours.

Avoid: too many side cards; the grid becoming visually secondary.

### Clients Directory

Table-first.

- Page header with primary action, compact KPIs only if useful, `WorkspaceToolbar` search/filter, main table.
- Rows show latest appointment service/provider/notes context, with Details-only row actions.
- Compact summary cards below the table — no right rail.

Avoid: duplicated summary cards; table data split across panels.

### Client Detail

A clean patient profile workspace.

- Open patient header with name, status, contact, right-side KPI cards, action row, underline tabs: Overview, Appointments, Medical Info, Documents, Messages, Payments.
- **Overview:** one unified left sidebar card (profile context, upcoming appointment, treatment plan, follow-up reminders) + a strict two-column right grid with equal-height cards (Care summary, Payment snapshot, Latest appointment, Health notes, Documents, Messages).
- **Appointments:** upcoming appointment panel, history table, reminders/recent-visits rail. Reminders live here, not in Medical Info.
- **Medical Info:** compact patient health info card + Medical summary/Clinical alerts rail; clinical-only data stays here.
- **Documents:** upload controls, document table, selected-document metadata, category summary rail.
- **Payments:** ledger-style metrics row (billed vs paid computed separately), payment history table, manual ledger form, payment-status rail; statement download produces a CSV.

Avoid: scattered cards, duplicated information (e.g. allergies in two cards), random side rails, uneven card sizes.

### Staff Directory

Table-first like Clients.

- Page header with primary action, compact KPIs, toolbar, main staff table with real shift/schedule data.
- Row-level check-in/check-out (schedule-aware) beside a Details button.
- Team schedule/coverage summary only where useful.

Avoid: unnecessary right rails, repeated staff summaries, over-cluttered tables.

### Staff Detail

Same open-header/tabbed record structure as Client detail.

- Detail header with name, role, status, contact, actions, and a right-aligned metric strip anchored to the identity header.
- Tabs/sections: schedule, appointments, performance, profile details.

Avoid: duplicated operational summaries, too many small cards, scattered profile information.

### Inbox

A three-pane messaging workspace: conversation list, active thread, right contact context panel.

- Compact header status — **no dashboard-style KPI cards**.
- Inline reply/actions; unknown contacts convertible to clients; fills the viewport height.

Avoid: metric clutter, unrelated summary cards, treating Inbox like a generic list page.

### Reports

A clean analytics experience (Pro) or a polished upgrade state (Basic).

When active, the settled structure is a **no-rail analytics stack**:

- header with period controls (daily/weekly/monthly, single date, custom from/to range)
- KPI row (six compact cards)
- performance chart + client mix
- full-width horizontal AI readout (not a tall AI side rail)
- three balanced operational cards (operational metrics, appointment status from the real status mix, detailed breakdown)
- demand windows and staff load

Sparse data uses natural-height compact empty/status states; hide the large trend chart when the appointment count is zero. AI insights clearly indicate when rule-based fallback was used.

Avoid: tall disconnected AI rails, masonry-like card placement, large blank chart areas.

### Settings

Calm and form-focused.

- Settings navigation; clear sections: business details, appearance, working hours, staff link/summary, WhatsApp configuration, reminders, billing.

Avoid: dashboard clutter, full-width forms, exposing provider implementation details.

### Forms

- Back link, page title, centered form container, sectioned form cards, consistent field spacing, clear save/cancel actions.
- Dedicated create pages exist at `/calendar/new`, `/clients/new`, `/staff/new`; full-page edit routes at `/clients/[id]/edit`, `/staff/[id]/edit`, `/calendar/[id]/edit`.

Avoid: stretched full-width forms, inconsistent field alignment, too many unrelated sections on one screen.

### Marketing Site

- `/` is a product-command-center landing page: code-native workspace mockups, clinic workflow storytelling, clinic-type targeting, problem/solution sections, product deep dives, privacy-conscious trust messaging, pricing preview, strong CTAs.
- `/product` is a guided seven-module feature tour (Dashboard, Calendar, Patients, Staff, Inbox/WhatsApp, Documents & Payments, Reports/AI insights), each with a focused feature-specific mockup — not repeated full-workspace visuals.
- `/pricing` aligns plan-fit explanation, Basic/Pro cards, and comparison table in one consistent stack.
- AI copy stays safe: "AI-assisted operational insights," never medical claims.
- Marketing CTAs use stable no-wrap button sizing.

---

## UI Component Philosophy

Use a clear component hierarchy.

### Primitives

Use existing UI primitives for: Button, Input, Select, Dialog, Dropdown, Badge, Tooltip, Tabs, Avatar, Checkbox, Textarea.

Do not rebuild primitives from scratch unless the current primitive is broken or too limiting.

### Layout and Product Components

Use the shared workspace structure system for: app frame, sidebar, topbar, workspace page wrapper, page headers, toolbars, metric grids/cards, section cards, side panels, tables, empty states, detail headers, detail tabs, form sections, activity lists, action lists, summary cards.

### Component Rules

- Do not scatter new components into random folders.
- Do not create a component unless it is reused or significantly simplifies a large file.
- Prefer shared layout components over repeated JSX.
- Prefer feature-specific components for logic-heavy UI.
- Keep UI-only components presentational; data fetching and business logic stay outside presentational components (view-model builders in `src/lib/` — see CLAUDE.md).

---

## Frontend Folder Structure

```txt
src/components/
  ui/          shadcn-style primitives (Base UI based)
  layout/      app shell, sidebar, topbar, navigation, global search, notifications, tour
  workspace/   shared structure system: WorkspacePage, WorkspaceHeader, WorkspaceToolbar,
               WorkspaceKpiGrid/Card, WorkspaceMainGrid, WorkspaceCard, WorkspaceRail,
               WorkspaceTable, WorkspaceEmptyState, form sections
  dashboard/   clients/  staff/  calendar/  inbox/  reports/  settings/
  onboarding/  auth/  marketing/  legal/  billing/  upgrade/
```

New or refactored UI components follow this structure — feature components in their feature folder, shared structure in `workspace/`, primitives in `ui/`.
