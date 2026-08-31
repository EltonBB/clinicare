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
- **Integrations:** **OpenAI** (analytics snapshots with rule-based fallback) is called via **raw `fetch()` — no SDK**. **WhatsApp is the only messaging channel wired today** and runs through **Baileys** in a separate always-on worker (`services/whatsapp-worker/`) that the app reaches over an HTTP bridge — Baileys holds a persistent socket and cannot run on Vercel's stateless functions. **Twilio is reserved for SMS/phone (never WhatsApp) and is not wired yet.** Keep dependencies lean: fewer deps keep provider swaps cheap and avoid vendor lock-in.
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

**Standard verification before pushing:** `npm run lint`, `npx tsc --noEmit`, and `npx vitest run`, then `npm run build` (and `npm audit --omit=dev` for dependency hygiene). A Vitest unit suite now exists (co-located `*.test.ts`, e.g. the messaging seam) — keep it green and add cases for new pure logic; signed-in browser QA remains the manual gate for UI/integration (see PROJECT_STATUS.md "Testing Checklist"). A reusable signed-in test session does not exist yet, so unauthenticated browser checks can only verify `/login` redirects and public pages.

**Responding to code review — fix the _class_, not the flagged line.** When a reviewer (the Codex bot or a person) flags one instance of a pattern, grep the whole codebase for siblings and fix them all in the same push before re-pushing — and audit the privileged sink up front. Reactive one-line patches just feed the review loop: an un-timed-out `fetch` flagged on one bridge call meant *every* cross-process call needed the same `AbortSignal`; a server-side auth fix needed its client-side twin.

**Task workflow — the review loop (token-efficient version, 2026-08-31).** This is the default shape for any non-trivial change in this repo, not a one-off. Supersedes an earlier fixed-pass version that burned a full session's usage in ~10 minutes on one mini-task (10 parallel review subagents per pass, several individually spending 100K+ tokens) — see the `deep-review-before-push` memory for the full incident and reasoning:

1. Break work into **mini tasks** — tackle one focused piece at a time, not one big objective in a single pass.
2. **Implement carefully, not quickly.** Read the actual current code before editing (not a stale plan/memory note) and verify assumptions with a targeted Grep/Read, not a broad agent dispatch. Match existing patterns. Run the fast mechanical gates (`tsc`, lint, existing tests) right after editing — the cheapest available bug-catcher, before any review step. Minimize what a reviewer would even find; don't lean on the review loop as the primary correctness mechanism.
3. **One review pass on the diff**, sized to match its risk — don't default to the highest effort level:
   - Small, contained diff: review it directly yourself, no subagent dispatch.
   - Larger or higher-risk diff (auth/security/data-integrity, many files, genuine uncertainty): `/code-review` at **low or medium** effort — always pass the level explicitly rather than relying on "reuses the level you typed last."
   - Reserve `high`/`max`/`ultra` for changes that genuinely justify the cost — rare, not the default.
4. If real issues turn up: fix them, then review again. Repeat until a pass finds nothing further.
5. Run `/ponytail-review` once.
6. One more review pass, same sizing rule as step 3. Finds something → fix it and repeat this step until clean — without re-running step 5, which only runs once per cycle. Clean immediately → stop.
7. Push / open the PR. Wait for Codex's review.
8. Codex clean → merge. Codex finds something → fix it, then re-enter the loop from step 3 (not a narrow reactive patch) before pushing again.

**Token efficiency applies throughout, not just review passes:** default to the cheapest tool that answers the question — direct Grep/Read over a dispatched agent for a simple lookup, one targeted agent over ten parallel ones for a small diff. Spend fully when a task genuinely needs it to get a correct result — that's still what matters most — but treat that as the exception, not the default.

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
      webhooks/whatsapp/baileys/    # inbound from the Baileys worker (shared-secret guarded)
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
- **Revalidate every surface a mutation feeds — and sweep the whole class.** After a successful write, `revalidatePath()` each page the changed data renders on (its directory row + detail page + the dashboard/Reports KPIs it rolls into) so a later navigation isn't served a stale Router-Cache payload. Two recurring blind spots: **(1) shell-global identity** — owner name/phone and business name/logo/accent are server-fetched in `(workspace)/layout.tsx` and render on *every* route, so a mutation that changes them needs `revalidatePath("/", "layout")`, never a page list; **(2) mutations outside the obvious feature folders** — `(auth)` profile updates and `settings` count too. When you add revalidation to one action, grep **every** `actions.ts` (including `(auth)`) for siblings that mutate without a matching revalidate and fix them in the same push — this is the "fix the class, not the line" rule applied to caching.
- **View-model builder pattern:** pages fetch via Prisma, then a `lib/<feature>.ts` function shapes the DB records into a presentational view model — `buildDashboardViewFromWorkspace`, `buildReportsViewFromWorkspace`, `buildInboxViewFromWorkspace`, `buildClientDirectoryViewFromRecords`, `buildStaffViewFromRecords`, `buildCalendarViewFromRecords`, `buildClientRecord`, etc. Components stay presentational; data shaping stays in `lib/`.
- **Auth / workspace context** is the entry gate for every authenticated path. Use the existing helpers — don't re-query auth ad hoc:
  - `requireCurrentUser()` / `getCurrentUser` (`lib/auth.ts`)
  - `requireCurrentWorkspace()` / `getCurrentWorkspaceContext()` (`lib/business.ts`) — the most-used cross-cutting helper
  - `requireCurrentBusiness()` (settings) and `getAuthedBusiness()` (calendar/inbox actions)
  These are request-deduped; reuse them rather than adding new auth lookups.
- **`cn()` (`lib/utils.ts`)** is the className merge helper and the single most-connected node in the codebase — use it for all conditional Tailwind classes.
- **Shared workspace primitives** (`components/workspace/`) enforce page width, card rhythm, KPI sizing, tables, rails, and empty states. Build pages from these instead of bespoke JSX — AGENTS.md's layout-type system maps onto them.
- **Media** is stored in a **private** Supabase Storage bucket (`clinic-media`). Never expose raw storage paths to the browser; resolve short-lived signed URLs via `lib/media-storage*.ts` (`createSignedImageUrl`, `resolveMediaDisplayUrl`). Uploads are restricted to allowed image/document MIME types.
- **Customer-facing language hides providers.** Never surface Baileys / Twilio / Supabase / Prisma / OpenAI internals or raw provider/database errors in UI — return generic, support-friendly messages.

## Architecture seams (portability guardrails — do not bypass)

The stack stays on AWS indefinitely — there is no planned cloud migration (ROADMAP.md). The provider seams keep the stack portable and any future provider swap cheap, but only if feature code never touches a provider directly. Every feature goes through these seams:

- **Auth** → only via the helpers in `lib/auth.ts` / `lib/business.ts`. Never import `@supabase/ssr` or `utils/supabase/*` in feature code — those imports stay confined to the existing auth/infra modules.
- **Media/storage** → only via `lib/media-storage*.ts`.
- **AI** → only via `lib/analytics-ai.ts`.
- **Messaging** → all outbound messages go through the `sendMessage(channel, payload)` abstraction in `lib/messaging/` (now built). Channel adapters live in `lib/messaging/adapters/`; the WhatsApp adapter talks to the Baileys worker over the HTTP bridge. Never call a provider — or the worker — directly from a feature, action, or component; go through `sendMessage`. New channels (Twilio SMS, Resend email) are added as adapters here, not inline.
- **Database** → only via Prisma (`lib/prisma.ts`); no raw Supabase data access.

If a task seems to require breaking a seam, stop and flag it — that's a roadmap decision, not an implementation detail.

## Patient-data engineering rules (apply now, not "later")

Pilot (Kosovo) data is non-PHI by design. GDPR is the active compliance regime (ROADMAP.md §1) — the US/HIPAA plan is kept ready but paused, not active work. These rules serve GDPR today and keep the HIPAA path cheap to resume if the US reopens, so they apply regardless of which regime is active:

- **No patient-identifying data in logs, error messages, analytics events, or third-party services.** Log record IDs, not names/diagnoses. The existing "generic customer-facing errors" rule is also a compliance rule.
- **Minimum-necessary messaging:** outbound SMS/WhatsApp/email reminders carry name + appointment time only — never clinical content. Bake this into templates and the messaging layer, don't rely on operator discipline.
- **Design for auditability:** audit logging (who viewed/changed which patient record, when), auto-logoff/session timeout, and role-based access are planned safeguards. When building PHI-adjacent features (client records, documents, messages, payments), structure data access through the `lib/` builders and server actions so audit hooks can attach in one place later.
- **PHI stays inside the trust boundary:** Supabase Postgres (via Prisma), the private `clinic-media` bucket, and server-side code. Never send patient data to new third-party services without flagging it as a compliance decision.

## Data model (`prisma/schema.prisma`)

Core entities: `Business`, `BusinessHours`, `StaffMember`, `StaffTimeEntry`, `StaffShift`, `ScheduleBlock`, `Client` (+ `ClientMedication`, `ClientDocument`, `ClientPayment`, `ClientHealthItem`, `ClientCareNote`, `ClientTreatmentPlanItem`, `ClientFollowUpReminder`, `ClientGalleryItem`), `Appointment` (+ `AppointmentReminder`, which carries a `status` of `SENT`/`FAILED`), `Conversation` + `Message`, `ReminderSettings`, `WhatsAppConnection`, `WhatsAppSession` + `WhatsAppSessionKey` (Baileys link credentials, non-PHI), `EmailVerificationReceipt`, `AnalyticsSnapshot`.

Everything is scoped to a `Business` (the workspace/tenant). Plan state lives on `Business` (`BusinessPlan` / `BusinessPlanStatus`; `isProBusinessPlan()` in `lib/billing.ts` gates Pro features like full Reports; public plan copy in `lib/public-plans.ts`).

## Security model

- **Tenant isolation is enforced server-side** through Prisma + the workspace-context helpers. Supabase public tables have **Row Level Security enabled with no public policies**, so the browser-exposed anon API cannot read/write app data.
- `src/proxy.ts` protects all `(workspace)` routes and sets global security headers; unauthenticated hits to `/dashboard`, `/calendar`, `/clients`, `/staff`, `/inbox`, `/reports`, `/settings` redirect to `/login`.
- Cron routes (`/api/cron/*`) and the WhatsApp worker webhook (`/api/webhooks/whatsapp/baileys`) are guarded (`isAuthorized()` / shared-secret check) — preserve those guards when editing.

## External integrations

- **WhatsApp (Baileys)** — the only WhatsApp integration. A separate always-on worker (`services/whatsapp-worker/`, deployed off-Vercel) holds the WhatsApp socket; the app pairs it by QR from Settings, sends through `sendMessage` → the worker's HTTP bridge (`lib/messaging/adapters/baileys.ts`, control plane in `lib/messaging/baileys-control.ts`), and receives inbound messages + delivery receipts at `/api/webhooks/whatsapp/baileys` → `Conversation`/`Message`. Link credentials live in `WhatsAppSession`/`WhatsAppSessionKey` (non-PHI, RLS-enabled). Kosovo-only, disposable, isolated behind the messaging seam (ROADMAP.md §2). Official WhatsApp (via an approved BSP) and Twilio **SMS/phone** are later, separate channels — not wired today.
- **OpenAI analytics** (`lib/analytics-ai.ts`, `lib/reports.ts`): Reports AI snapshots need a server-side OpenAI key in prod; without it the app writes an auditable **rule-based fallback** snapshot and shows that rules were used. A short cooldown rate-limits manual refresh.
- **Billing (planned):** Paddle behind `/checkout` — session creation, webhook verification, and plan activation are not implemented; the checkout page is preparation-only.
- **Cron:** `vercel.json` → `/api/cron/reminders` (daily 08:00) and `/api/cron/analytics` (daily 02:30).

## Not built yet — don't assume these exist

- **Twilio SMS** and **Resend email** channel adapters. The `sendMessage` seam and the **WhatsApp (Baileys) adapter** are built, and reminders + Inbox replies already flow through them; SMS/email are not wired yet.
- Audit logging, auto-logoff/session timeout, role-based access (Step 3).
- Paddle checkout sessions, webhooks, plan activation (Step 4).
- A reusable signed-in test session for browser QA (long-standing blocker).

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

## Capability advisor (suggest, then wait for green light)

A self-improving loop: surface the right capability per task and capture what we learn, but **suggesting is autonomous and acting is gated** — nothing that changes state runs until the owner green-lights it. Catalog: `.claude/CAPABILITIES.md`. Scratch: `.claude/friction-log.md`.

- **Foresight (before acting):** on substantive tasks, scan `.claude/CAPABILITIES.md`. If any skill/tool/MCP genuinely fits, name it in one line — what it'd do, why it fits — marking whether I run it (with the owner's OK) or it's his to invoke (`/name`, e.g. `/code-review ultra`). Wait for go-ahead before running any.
- **Hindsight (at wrap-up):** only if the task surfaced a real, behavior-changing improvement (workflow, the owner's prompting, code structure, token waste), drop one line in `.claude/friction-log.md`. Stay silent when there's nothing real.
- **Promote, don't hoard:** when the same friction recurs (~2–3×), suggest promoting it to a feedback memory or a CLAUDE.md rule — wait for green light before editing either.
- Skip trivial tasks. Surfacing a suggestion needs no approval; acting on one always does.
