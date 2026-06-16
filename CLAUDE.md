@AGENTS.md

# CLAUDE.md — Vela / Clinicare engineering guide

> `AGENTS.md` (imported above) is the **source of truth for product direction, layout types, brand rules, and UI/UX boundaries**. `ROADMAP.md` is the strategy layer (market, compliance, messaging channels, AWS infrastructure plan). `PROJECT_STATUS.md` is the running status log (what's done / next priorities). This file is the **technical/codebase layer**: stack, commands, architecture, and conventions. When product intent and this file disagree, AGENTS.md wins; when strategy and this file disagree, ROADMAP.md wins.

## ⚠️ Next.js version

This repo runs a **modified Next.js with breaking changes** (currently `^16.2.6`, App Router, React 19). Before touching routing, server/client components, caching, middleware, data fetching, server actions, layouts, or app-directory behavior, read the relevant guide in `node_modules/next/dist/docs/`. Do not assume older Next.js conventions.

## Stack

- **Framework:** Next.js 16 App Router, React 19, TypeScript (strict).
- **Styling:** Tailwind CSS 4 (`@tailwindcss/postcss`), `tw-animate-css`, `class-variance-authority` + `clsx` + `tailwind-merge` (via the `cn()` helper).
- **UI:** shadcn-style primitives in `src/components/ui/` built on `@base-ui/react`, Lucide icons. `components.json` holds shadcn config.
- **Data:** Prisma 6 (`@prisma/client`) over PostgreSQL, using the **`pg` driver adapter** (`@prisma/adapter-pg`). Database is hosted on Supabase.
- **Auth:** Supabase Auth (email/password + email confirmation) via `@supabase/ssr`.
- **Validation:** Zod 4.
- **Integrations:** Twilio (WhatsApp) and OpenAI (analytics snapshots with rule-based fallback) are called via **raw `fetch()` — no provider SDKs are installed**. Keep it that way: fewer dependencies keep provider swaps cheap and avoid vendor lock-in.
- **Hosting:** Vercel (deploy via the Git integration only — avoid `vercel` CLI deploys so each commit = one deployment). Cron in `vercel.json`.

## Commands

```bash
npm run dev          # next dev (http://localhost:3000)
npm run build        # prisma generate && next build
npm run start        # next start (prod server)
npm run lint         # eslint
npm run db:generate  # prisma generate
npm run db:push      # prisma db push  (apply schema to the DB)
npm run db:setup-auth-sync       # scripts/setup-auth-delete-sync.mjs
npm run media:normalize-storage-refs  # scripts/normalize-media-storage-refs.mjs
```

**Standard verification before pushing:** `npm run lint` then `npm run build` (and `npm audit --omit=dev` for dependency hygiene). There is no automated test suite — signed-in browser QA is the manual gate (see PROJECT_STATUS.md "Testing Checklist"). A reusable signed-in test session does not exist yet, so unauthenticated browser checks can only verify `/login` redirects and public pages.

## Architecture

```
src/
  app/
    (auth)/            # signup, login, confirm-email, forgot/reset password + actions.ts
    (workspace)/       # authenticated app: dashboard, calendar, clients, staff, inbox, reports, settings
                       #   each feature folder has page.tsx + actions.ts (+ [id]/ detail/edit routes)
                       #   layout.tsx renders the app shell; loading.tsx is the instant skeleton
    onboarding/        # post-confirmation multi-step setup + actions.ts
    api/
      cron/{analytics,reminders}/   # Vercel cron targets, guarded by a secret
      webhooks/twilio/whatsapp/     # inbound WhatsApp webhook
      search/                       # authenticated global search
      auth/email-verification-status/
    <marketing>/       # /, product, pricing, about, contact, checkout, terms, privacy, refund
  components/
    ui/                # shadcn primitives (Button, Card, Dialog, Tabs, Input, ...)
    layout/            # app-shell, sidebar/topbar, global-search, notifications, tour
    workspace/         # shared workspace structure system (WorkspacePage, *Header, *KpiGrid, *Table, *Rail, ...)
    {dashboard,clients,staff,calendar,inbox,reports,settings,onboarding,auth,marketing,legal,billing,upgrade}/
  lib/                 # server-side business logic + view-model builders (see below)
  utils/supabase/      # SSR Supabase clients: client.ts (browser), server.ts (RSC/actions), middleware.ts
  proxy.ts             # Next "proxy" — protects all (workspace) routes, applies global security headers
  hooks/               # e.g. use-mobile.ts
prisma/schema.prisma   # data model (see "Data model")
scripts/               # one-off ops scripts (.mjs)
graphify-out/          # generated knowledge graph (graph.html / graph.json / GRAPH_REPORT.md)
```

## Core conventions

- **Server actions live in `actions.ts`** alongside each route group. They return typed result objects (e.g. `CancelAppointmentResult`, `SaveDashboardWidgetsResult`) and validate input with Zod schemas. Keep mutations here, not in components.
- **View-model builder pattern:** pages fetch via Prisma, then a `lib/<feature>.ts` function shapes the DB records into a presentational view model — `buildDashboardViewFromWorkspace`, `buildReportsViewFromWorkspace`, `buildInboxViewFromWorkspace`, `buildClientDirectoryViewFromRecords`, `buildStaffViewFromRecords`, `buildCalendarViewFromRecords`, `buildClientRecord`, etc. Components stay presentational; data shaping stays in `lib/`.
- **Auth / workspace context** is the entry gate for every authenticated path. Use the existing helpers — don't re-query auth ad hoc:
  - `requireCurrentUser()` / `getCurrentUser` (`lib/auth.ts`)
  - `requireCurrentWorkspace()` / `getCurrentWorkspaceContext()` (`lib/business.ts`) — the most-used cross-cutting helper
  - `requireCurrentBusiness()` (settings) and `getAuthedBusiness()` (calendar/inbox actions)
  These are request-deduped; reuse them rather than adding new auth lookups.
- **`cn()` (`lib/utils.ts`)** is the className merge helper and the single most-connected node in the codebase — use it for all conditional Tailwind classes.
- **Shared workspace primitives** (`components/workspace/`) enforce page width, card rhythm, KPI sizing, tables, rails, and empty states. Build pages from these instead of bespoke JSX — AGENTS.md's layout-type system maps onto them.
- **Media** is stored in a **private** Supabase Storage bucket (`clinic-media`). Never expose raw storage paths to the browser; resolve short-lived signed URLs via `lib/media-storage*.ts` (`createSignedImageUrl`, `resolveMediaDisplayUrl`). Uploads are restricted to allowed image/document MIME types.
- **Customer-facing language hides providers.** Never surface Twilio / Supabase / Prisma / OpenAI internals or raw provider/database errors in UI — return generic, support-friendly messages (see `whatsapp-connection.ts` copy builders).

## Architecture seams (portability guardrails — do not bypass)

The stack stays on AWS indefinitely — there is no planned cloud migration (ROADMAP.md). The provider seams keep the stack portable and any future provider swap cheap, but only if feature code never touches a provider directly. Every feature goes through these seams:

- **Auth** → only via the helpers in `lib/auth.ts` / `lib/business.ts`. Never import `@supabase/ssr` or `utils/supabase/*` in feature code — those imports stay confined to the existing auth/infra modules.
- **Media/storage** → only via `lib/media-storage*.ts`.
- **AI** → only via `lib/analytics-ai.ts`.
- **Messaging** → all outbound messages go through the `sendMessage(channel, payload)` abstraction (ROADMAP Step 1; not built yet). Until it exists, provider calls stay confined to `lib/whatsapp*.ts` — never add a direct provider call in a feature, action, or component.
- **Database** → only via Prisma (`lib/prisma.ts`); no raw Supabase data access.

If a task seems to require breaking a seam, stop and flag it — that's a roadmap decision, not an implementation detail.

## HIPAA-ready engineering rules (apply now, not "later")

Pilot (Kosovo) data is non-PHI by design, but the app must be HIPAA-ready before the first US clinic (ROADMAP.md Step 3 + gate checklist). These are standing rules for all new code:

- **No patient-identifying data in logs, error messages, analytics events, or third-party services.** Log record IDs, not names/diagnoses. The existing "generic customer-facing errors" rule is also a compliance rule.
- **Minimum-necessary messaging:** outbound SMS/WhatsApp/email reminders carry name + appointment time only — never clinical content. Bake this into templates and the messaging layer, don't rely on operator discipline.
- **Design for auditability:** audit logging (who viewed/changed which patient record, when), auto-logoff/session timeout, and role-based access are planned safeguards. When building PHI-adjacent features (client records, documents, messages, payments), structure data access through the `lib/` builders and server actions so audit hooks can attach in one place later.
- **PHI stays inside the trust boundary:** Supabase Postgres (via Prisma), the private `clinic-media` bucket, and server-side code. Never send patient data to new third-party services without flagging it as a compliance decision.

## Data model (`prisma/schema.prisma`)

Core entities: `Business`, `BusinessHours`, `StaffMember`, `StaffTimeEntry`, `StaffShift`, `ScheduleBlock`, `Client` (+ `ClientMedication`, `ClientDocument`, `ClientPayment`, `ClientHealthItem`, `ClientCareNote`, `ClientTreatmentPlanItem`, `ClientFollowUpReminder`, `ClientGalleryItem`), `Appointment` (+ `AppointmentReminder`), `Conversation` + `Message`, `ReminderSettings`, `WhatsAppConnection`, `EmailVerificationReceipt`, `AnalyticsSnapshot`.

Everything is scoped to a `Business` (the workspace/tenant). Plan state lives on `Business` (`BusinessPlan` / `BusinessPlanStatus`; `isProBusinessPlan()` in `lib/billing.ts` gates Pro features like full Reports; public plan copy in `lib/public-plans.ts`).

## Security model

- **Tenant isolation is enforced server-side** through Prisma + the workspace-context helpers. Supabase public tables have **Row Level Security enabled with no public policies**, so the browser-exposed anon API cannot read/write app data.
- `src/proxy.ts` protects all `(workspace)` routes and sets global security headers; unauthenticated hits to `/dashboard`, `/calendar`, `/clients`, `/staff`, `/inbox`, `/reports`, `/settings` redirect to `/login`.
- Cron routes (`/api/cron/*`) and the Twilio webhook are guarded (`isAuthorized()` / secret check) — preserve those guards when editing.

## External integrations

- **Twilio WhatsApp** (`lib/whatsapp.ts`, `lib/whatsapp-connection.ts`): inbound via the webhook → `Conversation`/`Message`; outbound replies from Inbox. Customer-owned-number onboarding is not production-ready; a configured test sender is used for validation. The pilot WhatsApp channel will use Baileys behind the messaging seam (Kosovo-only, disposable — see ROADMAP.md §2).
- **OpenAI analytics** (`lib/analytics-ai.ts`, `lib/reports.ts`): Reports AI snapshots need a server-side OpenAI key in prod; without it the app writes an auditable **rule-based fallback** snapshot and shows that rules were used. A short cooldown rate-limits manual refresh.
- **Billing (planned):** Paddle behind `/checkout` — session creation, webhook verification, and plan activation are not implemented; the checkout page is preparation-only.
- **Cron:** `vercel.json` → `/api/cron/reminders` (daily 08:00) and `/api/cron/analytics` (daily 02:30).

## Not built yet — don't assume these exist

- `sendMessage(channel, payload)` messaging layer + Resend/Twilio/Baileys adapters (ROADMAP Step 1).
- Reminder automation wiring `lib/reminders.ts` + `/api/cron/reminders` into the messaging layer (Step 2).
- Audit logging, auto-logoff/session timeout, role-based access (Step 3).
- Paddle checkout sessions, webhooks, plan activation (Step 4).
- A reusable signed-in test session for browser QA (long-standing blocker).
- Customer-owned WhatsApp number onboarding (test sender only).

## Gotchas

- The root `README.md` is a short human-facing overview; AGENTS.md + ROADMAP.md + PROJECT_STATUS.md remain the authoritative agent docs.
- `build` runs `prisma generate` first; after schema edits run `npm run db:push` to apply to the DB (the schema is already applied to the configured Supabase Postgres).
- This is a **git worktree**; `graphify-out/` is generated output (safe to delete/regenerate).
- AGENTS.md is shared with other agents (e.g. Codex) — keep it self-contained and product-focused; codebase mechanics belong here in CLAUDE.md.

## Knowledge graph (graphify)

This repo has a generated knowledge graph in `graphify-out/` (1,438 nodes / 3,023 edges / 85 communities over code + docs + UI screenshots):

- `graphify-out/graph.html` — interactive visualization (open in a browser)
- `graphify-out/GRAPH_REPORT.md` — god nodes, communities, surprising connections, suggested questions
- `graphify-out/graph.json` — queryable graph data

Use it for architecture questions: `graphify query "how does WhatsApp inbound message become a conversation?"`, `graphify explain "requireCurrentWorkspace()"`, `graphify path "NewAppointmentForm()" "Prisma Database Adapter"`. Rebuild after big changes with `graphify update .` (code-only, no LLM) or the `/graphify` skill for a full re-extract.
