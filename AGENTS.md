<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vela / Clinicare Agent Instructions

## Mandatory Startup Workflow

At the start of every new chat or task in this project:

1. Read this `AGENTS.md` file first.
2. Read `PROJECT_STATUS.md` immediately after.
3. Read `ROADMAP.md` for strategy: market sequencing, compliance plan, messaging channels, and the infrastructure plan (AWS, no cloud migration).
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
| `ROADMAP.md` | Strategy: market, compliance, messaging channels, build order, AWS infrastructure | Where the project is going and why |
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

- **Market sequencing:** free pilot to ~50 **Kosovo** clinics, then **Balkans/Europe**. The US market is paused (not cancelled) as of 2026-08-28 — see ROADMAP.md §1.
- **Compliance:** **GDPR is the active regime** (Kosovo's GDPR-aligned law + any EU clinic). App-level safeguards (audit logging, auto-logoff, role-based/minimum-necessary access) are built **now, alongside features, not retrofitted later** — they move GDPR readiness forward today (a full GDPR legal assessment is still outstanding — see ROADMAP.md §5's disclaimer) and keep the HIPAA path (ROADMAP.md §5, kept ready for if the US reopens) cheap to resume.
- **Infrastructure:** **AWS indefinitely — no cloud migration planned.** Stay on the current AWS-backed stack (Supabase / Vercel / Baileys / OpenAI; Supabase + Vercel are AWS-hosted). Features still go behind the provider seams defined in CLAUDE.md — for portability and to avoid vendor lock-in (keeping any future provider swap cheap), not for a planned migration.
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

- **Channel plan** (ROADMAP.md): **Baileys WhatsApp is the only wired messaging channel today** (Kosovo-only, disposable, isolated) — confirmed sending and receiving real messages 2026-08-29. Resend already handles transactional auth email as Supabase Auth's custom SMTP, but has no application-level channel adapter yet for reminders/marketing; Twilio (SMS) isn't wired at all. The official WhatsApp upgrade (once a US entity + Meta access exist) is a later step, paused alongside the US market rather than actively gated; all channels stay behind the messaging seam so a provider can be swapped if needed.
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

### Visual language laws (locked)

These rules came out of owner review and apply to every workspace surface; new and refactored UI must follow them:

1. **Identity is square.** People/entity avatars and icon chips use rounded-square tiles (`--radius-tile`, white background, border, primary initials/icon) — never circles. Circles are reserved for status dots, count badges, and pill chips. (Dashboard + Clients surfaces migrated first; remaining surfaces adopt this as they're touched.)
2. **No filler text.** Empty fields render nothing — or one quiet section-level empty state. Never print "Not added", "No notes.", "TBD"-style placeholders per field. View models return empty strings, never placeholder copy.
3. **Sub-records are list rows.** Repeating records (medications, health items, plan items, notes, reminders) render as list rows — title, inline meta, badge, row actions — never grids of bordered mini-cards that leave empty cells. (Rows separate by padding/hover state, not divider lines — see rule 6; a surface built before 2026-09 may still show `divide-y` hairlines between rows until it's touched.)
4. **Label/value pairs are flex rows.** Sentence-case muted label left, truncating value right. No fixed-width label columns and no all-caps labels inside profile/summary lists (tiny uppercase labels remain fine on KPI tiles).
5. **No decorative sub-captions.** A page or card title does not get a grey descriptive sentence underneath restating what the section already shows or what the page obviously does (e.g. a "Reports" header does not need "How the clinic is performing and where to focus next" beneath it). Keep a caption only when it carries real, otherwise-invisible data (a period label like "Last 8 weeks", a live count). This reads as text-heavy and dated next to a plain, icon-led SaaS layout. (Calendar and Reports migrated first, 2026-09 — remaining surfaces adopt this as they're touched.)
6. **No dividers except structural chrome and card borders.** A card/section keeps its own outer border and the calendar/table grid keeps its own cell borders — those are the component's own structure. Everything else — a `border-b` under a page header, a hairline between list rows, a rule above a popover's footer action — is removed; use spacing and background/hover contrast instead. The sidebar/topbar borders that frame the whole workspace shell are the one other exception. `WorkspaceHeader` (`components/workspace/workspace-layout.tsx`) had its bottom divider removed app-wide 2026-09 as the one shared case; remaining page-specific dividers (list rows, table headers, popover footers) are removed as each surface is touched — Calendar and Reports are done first. **2026-09-16:** `WorkspaceTable`'s header rule and row `divide-y`, `DialogFooter`'s top rule, `WorkspaceFormSection`'s title rule, and `FilterChip`'s inactive/active border are also removed at the shared-primitive level — since every surface consumes these primitives, Clients/Staff tables and every dialog in the app are covered by this change already, not just Calendar/Reports.
7. **No decorative icon badges, no joined button groups.** A KPI card, highlight tile, AI-insight row, or stat strip does not get its own icon-in-a-square-tile before the label — the number and label already carry the meaning; a repeated icon next to every row adds nothing (the "four colors, four numbers" tell). Icons stay only where they convey information the label can't: identity tiles (rule 1), record-type differentiators in a mixed feed (a client's Recent activity timeline), and live status glyphs (paid/unpaid, connected/not connected). Likewise, a row of toggle buttons (view switchers, period pickers) never shares one outer bordered/filled container — each option is its own button with its own hover/active state, separated by spacing, not a segmented-control box. (Reports, Calendar, Client/Staff detail migrated first, 2026-09 — remaining surfaces adopt this as they're touched.)

The UI UX Pro Max skill may be used for UI/UX review and design work, but AGENTS.md remains the source of truth for Vela-specific product direction, layout types, brand rules, and functionality boundaries.

### Design skill workflow

Claude Code has a curated design-skill stack installed (`emil-design-eng`, `impeccable`, `design-taste-frontend`, `high-end-visual-design`, `redesign-existing-projects`, `apple-design` — added 2026-09). Use them **surface-dependently** — they supply craft; this file supplies the law:

- **Marketing pages** (`/`, `/product`, `/pricing`, `/about`): bold is good — `design-taste-frontend` / `high-end-visual-design` fit. Higher visual variance and motion are acceptable here.
- **Authenticated workspace** (dashboard, calendar, clients, staff, inbox, reports, settings): the calm/compact/restrained-motion rules above win. Use only `emil-design-eng` (interaction polish) and `impeccable` (audit/critique) here — never re-style the clinical workspace with marketing-grade variance.
- **`apple-design`** (Apple's WWDC-derived fluid-interaction guidance — springs, gesture momentum, translucent materials, optical typography): useful for its *universal* craft points — instant pointer-down feedback, motion anchored to its trigger (`transform-origin`, not a generic center), correct `prefers-reduced-motion` handling, size-specific type tracking. Its bouncy-spring and glass/blur defaults directly conflict with DESIGN.md's locked "no bounce/no elastic" and "flat white cards, never glass/blur decoration" rules — do not import those on the authenticated workspace; DESIGN.md's pinned system wins per the skill's own "the brief wins" precedence rule.
- **Always:** AGENTS.md + ROADMAP.md override any skill output. Do not run `/impeccable init` to generate a competing `DESIGN.md`/`PRODUCT.md` — point design skills at this file instead.

(These skills are installed for Claude Code only; Codex continues to use UI UX Pro Max.)

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

- **Gradient:** cobalt → light blue, `#0A22FF` → `#64B6FF`. This palette drives design tokens, gradient utilities, marketing highlights, and the default onboarding accent — **marketing/auth surfaces only**, see the owner decision below for the workspace.
- **Assets:** `public/brand/vela-icon.svg` and `public/brand/vela-logo.pdf`. The brand mark sits directly beside the "Vela" wordmark with **no bordered icon tile** on landing, auth, or workspace surfaces.
- **Typography:** the app font stack prioritizes the brand `Metal Reg-2` / Metal family when available locally.
- **Icon tiles and active states are flat:** white bordered tiles, not gradient-filled blue tiles or blue shadow pills. Heavy blue shaded treatments were deliberately removed — do not reintroduce them.

Use brand accents intentionally:

- primary actions
- active navigation
- key highlights
- important status/insight elements

Do not overuse gradients or make the app feel decorative. Most of the workspace should remain clean, light, readable, and operational.

**Owner decision, 2026-09-16 (locked, do not re-add via review):** three changes to the authenticated workspace only (dashboard, calendar, clients, staff, inbox, reports, settings) — marketing/auth keep the original brand exactly as documented above:
1. **Muted workspace accent.** The workspace's live `--primary` is now `#3142D8` (same hue family, less saturated), set via `brandAccentPresets[0]` in `src/lib/branding.ts` and injected by `app-shell.tsx` — not a `globals.css` change, so marketing/auth (outside the shell) keep the vivid `#0A22FF`. Do not "restore" the vivid blue inside the workspace citing this file's `#0A22FF` gradient spec above — that spec is now marketing-only.
2. **Squared-up radii.** `--radius-tile/-card/-field/-panel/-modal` (in `globals.css`, shared tokens) are all meaningfully smaller — buttons/cards/tiles/dialogs read as structured chrome, not pill-rounded. `--radius-hero` (marketing hero cards) is untouched.
3. **No gradient color anywhere in the workspace.** Every gradient fill (Staff directory completion bar, loading-skeleton shimmer, Reports' Performance-chart area fill, the dialog scrollbar thumb) was flattened to a solid/flat-opacity fill. The Reports AI card's `ScoreGauge` keeps its `conic-gradient()`-drawn percentage ring — a hard-edged two-color meter, not a color blend, and the exact visual this file's Reports section already locks — do not flag it as a violation of this rule.

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

- Calm data entry: page title, narrow centered form container, one essentials card, consistent field spacing, aligned cancel/save (see the Forms section under Page Direction for the 2026-09-19 minimal-forms decision).

### F. Settings Layout

Used for: Settings; onboarding/setup areas where appropriate.

- Configuration in clear sections; readable, focused forms; no dashboard-like clutter.

### G. Marketing Page Layout

Used for: public `/`, `/product`, `/pricing`, `/about`, `/contact`, `/checkout`, legal pages.

- Product-led storytelling on the shared marketing shell: hero, feature sections, CTAs.
- Product visuals use **sample data only — never live customer data, never draft/beta labels**.
- **The product UI itself is code-native, animated "live app panes" — never raster screenshots of the app.** The system lives in `components/marketing/appframe/`: `AppFrame` (mac window chrome + sidebar/topbar app chrome, cobalt-tinted layered shadow, optional 3D tilt + mesh glow), `AppPane` (in-view orchestrator broadcasting a reveal signal), `atoms.tsx` (CountUp, DrawArea, GrowBars, SweepDonut, StatusDot, TypingThenMessage, FloatingToast), and `panes.tsx` (the dashboard/calendar/finance/record/inbox/staff/insight bodies). They render crisp at any DPR and animate on scroll-in (numbers count up, bars grow, charts draw, the inbox types, the calendar drops in, tabs crossfade). Do NOT fake the product UI with PNG screenshots or `next/image`.
- **Rendered/raster BRAND ART is allowed on marketing surfaces only** (owner decision, 2026-06-30, to match Stripe-grade product presentation): abstract iridescent cobalt gradient mesh **backdrops** and glossy 3D **brand objects** (e.g. `public/marketing/mesh-dark.webp`, `mesh-light.webp`, `object-knot.png`) may sit behind/around the live panes so each pane reads as a composed scene. Constraints: stay within the locked cobalt→light-blue palette; abstract art only (no photographic people, no real patient/clinic photos, sample data optics intact); marketing only — the authenticated workspace stays strictly code-native, no decorative raster.
- Compose surfaces from these panes: the home `ProductShowcase` is an interactive tabbed showcase on a dark band; `/product` is a sticky-scroll `ModuleShowcase`; the Capabilities bento + Trust + AI band embed panes/atoms. All motion respects `prefers-reduced-motion` (panes render fully populated, static).
- Mobile-safe responsive structure; CTAs route to `/sign-up`, `/login`, `/pricing`, `/product`, `/contact`, and legal pages.

---

## Page Direction

These reflect the **settled** designs after many review passes. Do not re-invent these structures; refine within them.

### Dashboard

Answers: *What needs my attention today?*

- Page header with a single primary action ("New appointment") — no date subtitle (removed 2026-09, rule 5). There is **no customizer** — the dashboard is a fixed, curated layout (the configurable-widgets system was removed); the page uses the **wide** workspace frame.
- A **five-tile KPI row** (Appointments today, Completion rate, Active clients, Revenue this month, Unread messages) — label + value only, **no tone chip caption** underneath (removed 2026-09-16, see owner decision below); each tile still links to the surface that owns it (calendar, reports, clients, inbox), and each KPI appears exactly once.
- A primary row pairing the **Visits** card (7 / 30 / this-month / all-time totals — four stat tiles, `this month` added 2026-09-16 as a fourth tile so the stack naturally fills the taller card instead of needing to be centered — + a 7-day bar chart, no card-level caption, no week-over-week delta chip on the "Last 7 days" figure) with **Today's schedule** (a "Next up" panel above the day's appointment list). This row is **compact and sized by its content, like prod** (2026-09-17 owner decision — the earlier viewport-relative `calc(100vh-621px)` fill and a fixed-rem height were both reverted: they made the cards too tall and inconsistent across screen heights). The Today's-schedule list is capped at `max-h-[220px]` (about four rows, the fade hints there is more) and scrolls inside the card; the row does not grow on busy days. **2026-09-21 owner decision:** the row was tightened (~420px → ~370px) so the whole dashboard fits one 1080p screen without scrolling, and the four visit-total tiles got bigger numbers (`text-2xl`) and stretch to fill the card's height in one column (2×2 on phones). Inside the row: the Visits bar chart grows via its own `h-full`; the stat tiles split the card's height evenly (`sm:grid-rows-4`); the Today's-schedule appointment list stays packed directly under the "Next up" panel (`flex-1`, no `justify-center`) — any leftover height trails as natural whitespace *below* the list, never as a gap *between* "Next up" and the list (that gap read as a layout bug when tried, reverted same day).
- A secondary row of compact cards — recent activity, **Messages** (preview list + live unread badge), and **Staff today** — none of them restating a KPI. This row keeps its natural content height (no min-height fill — that was tried once and reverted per owner feedback, the fill belongs on the row above).
- **Owner decision, 2026-09-16 (locked, do not re-add via review):** the per-tile tone-chip caption (e.g. "Day complete", "27 done this month"), the Visits card's "Booked visits, cancellations excluded." description, and the "Last 7 days" week-over-week delta chip ("-47% vs prior week") were deliberately removed as visual clutter. Do not flag their absence as a regression.

Avoid: repeated appointment counts, cards that say the same thing, oversized empty panels, too many widgets competing for attention, reintroducing a customizer / command-center rail, or the removed KPI-chip/card-caption/delta-chip elements above.

### Calendar

Focus: scheduling. Redesigned 2026-09, four times — first to a flatter grid, then to uniform pill-style events, then to a simplified toolbar that fills the viewport (owner references: a clean month-grid SaaS calendar with click-to-popover event details; a minimal calendar with name+time pill events; a dark segmented-toolbar mockup), then (2026-09-21) to show completed visits, load month by month, and give Day view schedule rows — **no side rail**, the grid is the entire page.

- Page header is the title plus a flat toolbar: Day/Week/Month segmented pills, a text "Today" link right next to them, then (right-aligned) the date-range label immediately beside the date-jump calendar-icon popover, and New appointment — no prev/next arrow buttons (navigation is via "Today" and the date-jump popover only), no bordered/shadowed wrapper around the toolbar row, no description line under the page title.
- Appointments render as **uniform pills** in Month and Week views — client name left, start time right, tinted by status (the same tone set as everywhere else: confirmed/pending/completed/cancelled). No duration-scaled sizing.
- **Owner decision, 2026-09-21 (locked, do not re-add via review): Day view uses the same tinted pill as a schedule row.** Its single full-width column left ~900px of dead space between the name and the time, so the row reads time first, then client, then "service · staff", then the status in words (the last two hide below `sm`). Day view also lists **every** entry (the column scrolls) — reading the whole day is what that view is for — while Week columns stay capped at 8 with a "View N more" button.
- **All statuses are shown, completed visits included (owner decision, 2026-09-21 — never re-add a `status: { not: "COMPLETED" }` filter to the calendar query).** Past days show green completed pills; the old filter left every past day looking empty (only cancelled bookings survived) while the dashboard counted dozens of visits.
- **Data loads one month at a time.** The page loads only the viewed month's Monday–Sunday grid (`lib/calendar-data.ts`, at most 3,000 rows); the workspace fetches any other month through `loadCalendarMonthAction` when the user navigates to it (a quiet "Loading…" label, and an inline "Try again" banner if it fails) and merges it in. There is no fixed multi-month window, so history and far-future dates are always reachable instead of silently empty. "Today" and the today highlight always use the real date in the clinic's zone — never the `?date=` being viewed.
- The grid fills the viewport height below the header/toolbar on desktop (`lg:h-[calc(100vh-230px)]`, mirroring Inbox's own fill pattern) rather than sizing to a fixed max-height — month rows and week/day columns stretch to use the available screen instead of leaving blank space under a short grid. An empty week/day column centers its "+ Add" prompt vertically instead of stranding it at the top.
- Month view: plain flat cells (white, hairline borders, day number top-left, no open/closed background tinting — only non-current-month days are muted). A busy day's overflow count (`+N`, with "more" from `lg` up) sits in the **date row**, top-right — never on a line under the pills: cells clip their overflow, so a line beneath two pills fell outside the cell and the count was invisible on every busy day. Clicking a pill opens a small floating **quick-view popover** (client, time, service, status + a link into the edit page); clicking empty cell space still jumps into Day view for that date.
- Week/Day views have **no hour-axis grid** — no time-of-day labels, no click-a-specific-time-slot booking, no now-line. Each day is a column listing that day's entries sorted by time, plus one "+ Add" action at the bottom (routes to New appointment pre-filled with the date; the exact time is picked in the form, not on the grid). Week view scrolls horizontally below its ~720px minimum width rather than crushing 7 columns unreadably.
- There is no "Selected day" or "Utilization" rail — that context now lives in the quick-view popover (per event) or by switching to Day view (per date).

Avoid: a side rail, prev/next arrow buttons, background tinting for open/closed days, a header description sentence, an hour-axis time grid, duration-scaled event cards, reintroducing a summary card the grid already shows, a status filter that hides completed visits, a fixed loading window that leaves other months silently empty, an overflow count placed below the pills, capping the Day view's list.

### Clients Directory

Table-first; filters do the summarizing. **No KPI band** — the page is header → toolbar → table.

- Page header with primary action only. The counted filter chips are the page's summary layer (the "All" chip is the total; "Attention" is the flag count).
- `WorkspaceToolbar` with search plus filter chips that carry live counts. Chips include manual statuses **and derived smart segments**: "Attention" (manual at-risk OR no visit in 90+ days) and "No visits". Smart segments replace summary cards — don't reintroduce a card band or KPI tiles.
- Search, status filter, and pagination are **URL-backed and server-side** (`?q=&status=&page=`); never load the full client list into the browser.
- The table is sorted by most recently updated; rows show square initial tiles, name only (no phone/email line), latest appointment service only (no provider-name line, no free-text visit notes — clinical text stays on the record), status badge only (no inline attention-reason text — the "Attention" filter chip already surfaces it), and Details-only row actions.
- **Owner decision, 2026-09-16 (locked, do not re-add via review):** the phone/email line under the client name, the provider-name line under the latest appointment, and the inline attention-reason text under status were deliberately removed as visual clutter. A prior redesign pass dropped them by accident and a later review pass restored them citing this file — that restore is superseded by this entry. Do not flag their absence as a regression; the underlying data (`needsAttention`, etc.) may still exist for filtering, it's just not rendered per-row.

Avoid: summary/KPI furniture restating what the filter chips already say; client-side filtering over unbounded queries; visit-note text in list rows; the removed per-row contact/provider/attention-reason lines above.

### Client Detail

A clean, **read-first** patient profile workspace. Content is the hero; data entry happens in dialogs.

- Open patient header with square identity tile, name, tone-mapped status badge, one line with the phone (+ "Prefers …" when set), and the action row (Book appointment is the primary action, then Send message and Edit profile), then underline tabs: Overview, Appointments, Medical Info, Documents, Payments (five tabs — Messages was folded into the Overview timeline + inbox deep links).
- **Owner decision, 2026-09-20 (locked, do not re-add via review):** the header's **stat strip** (Visits | Completed | Pending | Balance), the **email**, and the **"Last visit"** line were removed as repeats — email now lives in the Overview **Details** card, visit/appointment counts in the Appointments tab, and the balance in the Payments tab. There is no "No contact details yet" filler.
- **All sub-records (medications, health items, treatment items, provider notes, follow-up reminders, payments, documents, gallery images) are managed through "+ Add" dialogs with edit and delete row actions** — never always-visible inline creation forms. Deletes confirm in a small dialog.
- **Owner decision, 2026-09-20 (locked, do not re-add via review):** the detail pages were rearranged to stop repeating the header and to stop showing empty sections. Rules: (1) nothing the header already shows (name, status, phone, email, Edit profile) is repeated in a tab; (2) a tab with nothing recorded shows **one** empty state with the Add button, not a stack of empty cards; once records exist only the sections that have records render; (3) no rails that restate the main table (Documents summary, Payment status, Recent visits, the duplicate Upcoming-appointment panel were removed).
- **Overview:** a full-width row of compact info cards that fill the width — **Next appointment**, **Details** (email, patient type, date of birth, gender, address, notes — only what's filled), and **Health** (only when there are alerts/allergies/important notes/current medication) — above the merged **Recent activity timeline** (appointments, payments, notes, documents, messages in one chronological feed). No profile sidebar; the Payment snapshot card is gone (the Payments tab and the header Balance cover it).
- **Appointments:** one appointments table (date & time, service, status, notes), beside a small **Follow-up reminders** card (dialog-managed, "+ Add"). Booking is only ever the header's Book appointment button — no second Book button inside the tab, its empty state, or the Overview's Next-appointment card (2026-09-20: two buttons with the same job aren't needed). No appointments → a plain "No appointments yet" empty state.
- **Medical Info:** empty → "No medical records yet" + **Add medical record**. The button (and **Add record** once records exist) opens a chooser — Medication, Allergy or health alert, Treatment plan item, Provider note, Medical background — and the chosen kind opens its own form dialog. Only kinds with records render, as a two-column grid of cards (Health record, Medications, Treatment plan, Provider notes, and a **Background** card for the free-text medical history/allergies/health notes/previous treatments/treatment plan), each with a small "+ Add" and row edit/delete. The free-text background is edited **here** (dialog + `updateClientMedicalBackgroundAction`), not on the profile edit page. Don't show fabricated per-row data the model can't back (e.g. per-visit provider).
- **Documents:** empty → one empty state with **Add manually** / **Upload document**. Otherwise an actions row, the click-to-select document table, gallery, and a **Selected document** rail (no category summary).
- **Payments:** empty → one empty state with **Add entry**. Otherwise the ledger metrics row (billed vs paid computed separately) above a full-width payment history table with edit/delete, dialog-based manual entry and a CSV statement download (no separate payment-status rail). **Add entry asks for five fields only** (amount, status, payment date, payment method, description); invoice number, receipt number, receipt link and billing note are added by editing the entry (2026-09-20). The Overview's Next appointment content is plain text on the card — no tinted box.

Avoid: permanent inline forms, append-only records with no correction path, mini-card grids with empty cells, per-field placeholder text, duplicated information, summary cards that restate header KPIs, stacks of empty sections.

### Staff Directory

Table-first like Clients. **No KPI band** — the page is header → toolbar → table.

- Page header with primary action only. Counted filter chips (All / Active / Away / Inactive / Checked in) are the page's summary layer; a role select appears beside them when more than one role exists.
- Status means employment status (Active / Away / Inactive); **checked-in is a separate signal** (small emerald "Checked in now" line under the status) — never conflate the two.
- Rows: square initial tiles; name only (no email/phone line); Role pill; Today column shows today's shift or "Next: …" only (no appointment-count line beneath); completion rate with a flat bar (rendered only when non-zero).
- Row actions: schedule-aware check-in/check-out (outline) beside a primary Details button.
- No pagination furniture — staff lists are small and filter client-side.
- **Owner decision, 2026-09-16 (locked, do not re-add via review):** the email/phone line under the staff name and the "N appointments today" line under the shift were deliberately removed as visual clutter. A prior redesign pass dropped them by accident and a later review pass restored them citing this file — that restore is superseded by this entry. Do not flag their absence as a regression.

Avoid: summary/coverage cards that restate table rows, fabricated metrics (e.g. utilization derived from an assumed capacity), fake pagination footers, right rails, the removed per-row contact/appointment-count lines above.

### Staff Detail

Same read-first open-header structure as Client detail.

- Header: square identity tile, name + tone-mapped status badge, a small "Checked in now" line only while checked in, and the action row (Check in/out + Edit profile).
- **Owner decision, 2026-09-20 (locked, do not re-add via review):** the header's **stat strip** (Appts today | This month | Completion | Weekly hours), the **role/phone/email line**, and the **shift line** ("Today's shift" / "Next shift") were removed as repeats — role, phone, and email live in the Overview **Profile** card, today's/next shift in the Today card, weekly hours in the Schedule tab, and completion in the staff directory. No "No contact details yet" filler.
- Three tabs: **Overview** (main column: a **Today** card — the shift label in its header, today's appointments or a one-line "no shift / next shift" message — and a **Recent work** list; side column: a **Profile** card — role, phone, email, and staff notes when present — and Mobile access), **Schedule** (planned shifts plus a Time tracked this week list — per-entry check-in/out times and durations — with a Manage link to the edit page; with neither, one "No shifts planned" empty state with a Plan shifts action), and **Messages** (the staff↔admin thread, with an unread-count dot on the tab trigger when there's anything unseen).
- **Owner decision, 2026-09-20 (locked, do not re-add via review):** the Overview's profile sidebar (avatar, name, role, phone, email, status, weekly hours, Edit profile) was removed — the header already shows all of it. Don't restore it. Same empty-state rule as Client Detail: one message, not a stack of empty cards.
- Appointments/performance data lives in the header strip and Overview lists — no tabs restate it. Messages is a genuinely distinct surface (the admin-facing 1:1 thread), not a restatement of anything else.
- When check-in is unavailable, the reason renders as a small muted line under the header actions (never tooltip-only); shift rows show a status badge only when the status differs from the default.

Avoid: duplicated operational summaries, panels that restate the header (Staff information / Operational summary-style cards), fabricated metrics, too many small cards, scattered profile information.

### Inbox

A **two-pane** messaging workspace (redesigned 2026-06): conversation list (320px) + active thread. There is **no right context rail** — contact context lives in the thread header.

- List pane: search, counted **All / Unread filter chips**, a one-line connection status, then conversation rows (square identity tile, name + time, snippet, unread count pill, left accent bar on the active row).
- Thread: header with square tile, name, **phone line**, and actions (View profile or Convert to client + an icon-only delete button); messages grouped under **day separators** (Today / Yesterday / date); client bubbles white with a hairline ring, business bubbles primary; composer row at the bottom.
- Identity tiles are square; conversation previews show the **newest** message (empty conversations show nothing); never invent presence claims like "Active now".
- Thread switches use a ~150ms fade (framer-motion); the pane fills the viewport height.

Avoid: a third context pane, dashboard-style KPI cards, metric clutter, fabricated activity/presence labels.

### Reports

A clean analytics experience (Pro) or a polished upgrade state (Basic). Redesigned 2026-09 into a **single scrolling page — no tabs**, run as a 4-2-1-3 stack (the first pass trimmed to a strict 4-cards/2-panels/1-list template; the owner then asked for three more rows back — Appointment status, Highlights, Booking patterns — then, after living with three full-width rows, asked to compact them into one row of three equal-size cards and drop Client mix entirely, so the page now runs KPIs → Performance/AI insight → Staff performance → Appointment status/Highlights/Booking patterns). The period selector (daily/weekly/monthly/custom) and Refresh AI live in the page header; there is no subtitle under the "Reports" title. All sections stay behind the Pro gate as a unit — there is no partial-Basic view.

- header controls: period pills (daily/weekly/monthly + Custom range when active), a **calendar icon button** that opens a small popover (From/To date inputs + "Analyse range"; both dates required) — never inline date inputs in the header — and Refresh AI, all h-10
- compact paddings (`p-4` cards, `gap-3`) are deliberate; don't re-inflate them — the page scrolls normally like the rest of the workspace, it does not lock to one viewport

**Row 1 — four KPI cards** (Appointments, Completion rate, New clients, Estimated utilization), each a plain label + large value + tinted delta pill + comparison caption — **no icon, no embedded mini-chart**; the number is the hero (rule 7), and the trend already lives in the Performance chart below. Clicking a card expands a one-line detail (inline on mobile, a shared panel below the row on desktop).

**Row 2 — Performance chart beside the AI insight card, equal width**: the chart is edge-to-edge, monotone-cubic, shared-scale, with three series — appointments, completed, and a dotted muted "Previous period" ghost line. The AI card leads with a visual **health-score gauge** (a small conic-gradient ring, tone-colored, the score centered) beside the tone label ("Strong" / "Healthy" / "Needs watching" / "Needs attention") — never a bare text pill for the score — then three plain rows (Summary / Diagnosis / Next move), label above title above detail text, no per-row icon (rule 7).

**Row 3 — Staff performance, full width**: the per-provider sortable list (square identity tile, name only — no role line, removed 2026-09-16 — visit count, inline load bar, completion rate — `—` when unmeasured). Clicking a row expands an inline accordion with a "View profile" link to that provider's Staff Detail page — never a duplicate profile view.

**Row 4 — Appointment status, Highlights, and Booking patterns as three equal-size cards** in one responsive row (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`, `items-stretch` so all three match the tallest card's height) — there is no fourth "Client mix" card; that breakdown was dropped from Reports:
  - **Appointment status**: the status-mix donut + legend, centered in the card. The card header carries a small `#`/`%` toggle (two individual buttons, not a segmented control — rule 7) that switches the legend rows and the hovered center value between raw count and percentage — **never both at once**.
  - **Highlights**: up to five compact tiles (Average visit length, Repeat-visit rate, Lost-slot rate, Follow-up coverage, Active clients) — bold title line above a detail sentence, **no tile border** (removed 2026-09-16) — stacked single-column and vertically centered in the card — only the ones with measured data render, so a quiet period can show as few as one or two, never a placeholder tile, and never leaves visible blank space below a short list.
  - **Booking patterns**: a day × time-band heat-grid (4 fixed bands — morning/midday/afternoon/evening, abbreviated to fit the narrower card) with a "peak window" callout and a booking-behavior stats strip (avg lead time, same-day bookings, unassigned appointments) — no icons on the callout or the stats (rule 7).
- **Owner decision, 2026-09-16 (locked, do not re-add via review):** Appointment status legend rows used to show count and percentage together (e.g. "27 · 73%") — this was replaced by the `#`/`%` toggle above; do not restore the combined format. Highlight tiles briefly had their title line removed (same day) and their border removed — the owner then asked for the title back, so **only the border stays removed**; keep the title, don't re-add the border.

**Drill-down pattern:** where it exists (KPI cards, Staff rows), clicking expands an inline panel directly in place — never a dialog, never a page navigation.

**The delta rule:** a delta always means "change vs the previous period"; point-in-time numbers carry no delta and no trend arrow. Capacity-derived utilization is labeled **"Estimated utilization"** with its basis stated.

Sparse data uses natural-height compact empty/status states; the trend chart is hidden when no chart bucket has appointments. Custom date ranges always use rule-based analysis and say so; AI insights clearly indicate when rule-based fallback was used.

Avoid: dense metric-table cards (Operational detail-style), synthetic deltas/trends on point-in-time numbers, section subtitles that just restate the heading or repeat data already shown in that section, embedded KPI-card mini-charts, tabs/sub-navigation splitting this page.

### Settings

Settings is a **popup opened from the sidebar/mobile nav** (Claude-style), not a standalone page — `/settings` is kept only as a deep-link/tour fallback. It is a **master-detail** workspace (revised 2026-06 after owner review): a left section list + a right pane that shows **one section at a time**, each opening as its own purposeful, well-described, filled page.

- Left: a **section nav card** — one row per section with a square icon tile, title, one-line subtitle, and chevron; the selected row is tinted primary; clicking switches the right pane (no scrollspy/scroll). **Save changes / Discard changes buttons live at the bottom of this card** (Discard disabled when nothing changed; resets to last saved state).
- Right: the **active section only**, as one card with a header (title + one-line description) above its content. Each section is filled with meaningful content — never a lone sparse card; the dialog sizes to its content so panes are never hollow. **There is no Staff section** — staff lives only in its own workspace. The settled component designs:
  - **Business details**: logo tile + Upload button + size hint as a header row (no logo-URL paste input), then a 2-col field grid (name, type, owner, support email).
  - **Appearance**: one wrapping row of **color chip pills** (color dot with a check on the selected one + name) plus an inline custom chip (native color input dot + hex field); a single helper line below.
  - **Working hours**: 7 days as fixed-height divided toggle rows split across two columns; enabled days show inline start–end selects, closed days a muted "Closed".
  - **Reminders**: two fixed-height divided toggle rows ("First/Second reminder" + inline "Nh before" select; "Off" when disabled), then the message template with a variables hint line.
  - **WhatsApp**: a status panel (dot + Connected/Not connected + quiet Refresh, plus the connection detail and next-step line) above the number input + Connect, a format hint, and a checklist of what connecting enables — including the minimum-necessary "name + appointment time only, never clinical detail" line.
  - **Billing**: a plan panel (name + status pill + one-line note) above a feature checklist ("Included in your plan" on Pro / "Unlock with Pro" on Basic) and a support line + Manage plan CTA.
- The workspace tour anchors to the WhatsApp **nav button** (`settings-whatsapp`), which is always rendered.
- Field labels are sentence case (no all-caps/letter-spaced labels); status pills use sentence case.

Avoid: cramming every section into one long scroll, hollow/oversized panes, a sparse single-card section, a Staff section, dashboard clutter, exposing provider implementation details or internal product names in any customer-facing copy.

### Forms

- Page title only (no breadcrumb, eyebrow, or description line — Cancel is the way back), a narrow centered form container (`max-w-[680px]`), one form card for the essentials, consistent field spacing, Cancel + a single primary action. Built from `CreatePageShell` + `WorkspaceFormSection` + the shared `form-parts.tsx` (`FormField`, `FormSelect`, `FormError`, `FormActions`).
- Dedicated create pages exist at `/calendar/new`, `/clients/new`, `/staff/new`; full-page edit routes at `/clients/[id]/edit`, `/staff/[id]/edit`, `/calendar/[id]/edit`.
- **Owner decision, 2026-09-19, refined 2026-09-20 (locked, do not re-add via review):** forms stay minimal but not bare. Create forms keep the essentials plus a few useful extras, sized close to each other (roughly 3–5 field rows in one card). Client: name, phone, email, date of birth, gender, preferred contact, address, notes (the same `ClientProfileFields` the edit form uses; edit adds status + patient type). Staff: name, role, phone, email, note, and the compact weekly schedule (edit adds status). Booking: client, service, staff, **date, one Time and a Duration** (no separate Start/End pickers — the end time is derived from time + duration), notes (edit adds status). **The client edit form carries no medical fields** — the free-text medical background is edited from the client's Medical Info tab (see Client Detail); the edit form passes the stored values through so a profile save never wipes them. The client picker shows just the name once selected (phone stays on the dropdown rows to tell people apart while searching).
- No section titles on single-card forms, no field placeholders except the phone format hint, no helper/explainer sentences (only a closed-clinic warning on the booking date), no icons on form buttons; destructive record actions (Delete / Cancel booking) are quiet text buttons on the left of the footer.

Avoid: stretched full-width forms, inconsistent field alignment, too many unrelated sections on one screen, re-adding the removed header lines, medical fields on the client edit form, separate Start/End time pickers on the booking form.

### Marketing Site

- `/` is a product-command-center landing page: code-native workspace mockups, clinic workflow storytelling, clinic-type targeting, problem/solution sections, product deep dives, privacy-conscious trust messaging, pricing preview, strong CTAs.
- `/product` is a guided seven-module feature tour (Dashboard, Calendar, Patients, Staff, Inbox/WhatsApp, Documents & Payments, Reports/AI insights) rendered as a sticky-scroll showcase: scrolling blurbs on the left drive a pinned, code-native live app pane on the right that crossfades per module — not repeated full-workspace visuals, never screenshots.
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
