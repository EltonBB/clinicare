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

These four rules came out of owner review and apply to every workspace surface; new and refactored UI must follow them:

1. **Identity is square.** People/entity avatars and icon chips use rounded-square tiles (`--radius-tile`, white background, border, primary initials/icon) — never circles. Circles are reserved for status dots, count badges, and pill chips. (Dashboard + Clients surfaces migrated first; remaining surfaces adopt this as they're touched.)
2. **No filler text.** Empty fields render nothing — or one quiet section-level empty state. Never print "Not added", "No notes.", "TBD"-style placeholders per field. View models return empty strings, never placeholder copy.
3. **Sub-records are list rows.** Repeating records (medications, health items, plan items, notes, reminders) render as divided list rows — title, inline meta, badge, row actions — never grids of bordered mini-cards that leave empty cells.
4. **Label/value pairs are flex rows.** Sentence-case muted label left, truncating value right. No fixed-width label columns and no all-caps labels inside profile/summary lists (tiny uppercase labels remain fine on KPI tiles).

The UI UX Pro Max skill may be used for UI/UX review and design work, but AGENTS.md remains the source of truth for Vela-specific product direction, layout types, brand rules, and functionality boundaries.

### Design skill workflow

Claude Code has a curated design-skill stack installed (`emil-design-eng`, `impeccable`, `design-taste-frontend`, `high-end-visual-design`, `redesign-existing-projects`). Use them **surface-dependently** — they supply craft; this file supplies the law:

- **Marketing pages** (`/`, `/product`, `/pricing`, `/about`): bold is good — `design-taste-frontend` / `high-end-visual-design` fit. Higher visual variance and motion are acceptable here.
- **Authenticated workspace** (dashboard, calendar, clients, staff, inbox, reports, settings): the calm/compact/restrained-motion rules above win. Use only `emil-design-eng` (interaction polish) and `impeccable` (audit/critique) here — never re-style the clinical workspace with marketing-grade variance.
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

Redesigned 2026-09/10 after repeated owner review (references: Ramp, Stripe, Linear, Resend, Awwwards). These rules replace the earlier "live app panes" system, which was deleted:

- **No product mockups, anywhere on marketing.** No app screenshots, no code-built dashboard/calendar/inbox panes, no window chrome. The owner rejected every variant (screenshot, code-native pane, framed image). Show the product through honest abstract content instead: edge-bleeding row lists, a typed reminder, a trend line, a scroll story.
- **Layout: anchored to the nav grid.** Content sits in `max-w-7xl px-4 sm:px-6 lg:px-8` on ONE element (the same as the header), so card and text edges line up with the logo and the header button. Never pad the `<section>` and re-center an inner `max-w-*` div: that double-applies padding and misaligns by ~32px. Text and headers are left-aligned by default; centering is a deliberate exception (the About manifesto).
- **Cards Ramp-style:** header text top-left with padding; the visual below bleeds to the card's own edges (negative margins cancel the padding, `overflow-hidden` keeps the rounded corners). Never a small element floating centered in a padded box.
- **Section headers are two-tone** (`shared/section-header.tsx`): an ink lead running into a muted continuation in one sentence.
- **Every page opens differently; don't stamp one component everywhere.** Home: the day dial (one sample clinic day around a clock face) over a loose school of small Vela marks that swim behind the hero and dart away from the pointer (canvas, paused off screen, still under reduced motion). Product: rolling-word headline synced to a rail of the six modules. Pricing: compact header with plans above the fold. About: centered manifesto. Contact: headline and form share the opening. Legal: document layout with a scroll-tracking table of contents. Headlines share only the word-by-word reveal (`motion/word-reveal.tsx`); a trailing period goes inside `<Highlight>` so it never detaches.
- **The footer is the closing stage.** Every page ends on the ink footer (giant cursor-lit "Vela" wordmark cropped by the page edge). Pages that close on an ask pass `footerCta` to `MarketingShell` and the CTA opens the footer; there is no separate CTA band. The header turns ink over any `data-tone="dark"` section and underlines the current page.
- **No announcement banners or pill badges** (e.g. "Free pilot for…") and **no regional positioning** in customer-facing copy: never present Vela as a Kosovo- or region-based product.
- **No vanity stat strips** ("5 modules / 1 login / 0 spreadsheets") and no "Most popular" badges: Vela is pre-launch, so popularity and traction claims are fabricated by definition.
- **Visuals must mean something for a clinic.** The owner rejected abstract particle art (the Three.js wave and the point sphere were removed). Every hero or panel visual shows clinic reality as content: appointments, staff, slots, reminders. Three.js stays allowed for that purpose only; load it with `next/dynamic` (`ssr: false`), pause off screen, and respect reduced motion. Round any computed SVG coordinates so server and client markup match.
- **Motion has a job.** Each animation explains, gives feedback, or paces reading (typing reminder, auto-advancing module explorer, scroll-filled steps, clock-driven day story, cursor spotlight on dark cards). Buttons get `active:scale-[0.97]`. Everything respects `prefers-reduced-motion`.
- **Honesty:** sample names and illustrative data only, and say so where it could read as real (the testimonial wall is labeled "Illustrative"). Never invent usage numbers, results, or customer logos; Vela is pre-launch. Visible copy uses no em-dashes.
- **Abstract brand art** (gradient meshes, 3D brand objects) is allowed on marketing only, within the cobalt palette; no photos of people or real clinics. The authenticated workspace stays strictly code-native.
- Mobile-safe responsive structure; CTAs route to `/sign-up`, `/login`, `/pricing`, `/product`, `/contact`, and legal pages.

---

## Page Direction

These reflect the **settled** designs after many review passes. Do not re-invent these structures; refine within them.

### Dashboard

Answers: *What needs my attention today?*

- Page header with the date and a single primary action ("New appointment"). There is **no customizer** — the dashboard is a fixed, curated layout (the configurable-widgets system was removed); the page uses the **wide** workspace frame.
- A **five-tile KPI row** (Appointments today, Completion rate, Active clients, Revenue this month, Unread messages). Each tile carries a tone chip and links to the surface that owns it (calendar, reports, clients, inbox); each KPI appears exactly once.
- A primary row pairing the **Visits** card (7 / 30 / all-time totals + a 7-day bar chart — 14 days of data considered, comparing the last 7 against the prior 7 for the week-over-week delta — cancellations excluded) with **Today's schedule** (a "Next up" panel above the day's appointment list).
- A secondary row of compact cards — recent activity, **Messages** (preview list + live unread badge), and **Staff today** — none of them restating a KPI.

Avoid: repeated appointment counts, cards that say the same thing, oversized empty panels, too many widgets competing for attention, or reintroducing a customizer / command-center rail.

### Calendar

Focus: scheduling.

- Page header with view/date controls plus a direct date-jump control.
- Calendar grid as the main focus; schedule blocks render as blocked time.
- Selected-day/appointment context lives in the **side panel** — no duplicated lower summary panels.
- Utilization derives from the selected view and saved business hours.

Avoid: too many side cards; the grid becoming visually secondary.

### Clients Directory

Table-first; filters do the summarizing. **No KPI band** — the page is header → toolbar → table.

- Page header with primary action only. The counted filter chips are the page's summary layer (the "All" chip is the total; "Attention" is the flag count).
- `WorkspaceToolbar` with search plus filter chips that carry live counts. Chips include manual statuses **and derived smart segments**: "Attention" (manual at-risk OR no visit in 90+ days) and "No visits". Smart segments replace summary cards — don't reintroduce a card band or KPI tiles.
- Search, status filter, and pagination are **URL-backed and server-side** (`?q=&status=&page=`); never load the full client list into the browser.
- The table is sorted by most recently updated; rows show square initial tiles and latest appointment service + provider context (no free-text visit notes in the list — clinical text stays on the record), Details-only row actions, and flagged rows show their attention reason inline under the status.

Avoid: summary/KPI furniture restating what the filter chips already say; client-side filtering over unbounded queries; visit-note text in list rows.

### Client Detail

A clean, **read-first** patient profile workspace. Content is the hero; data entry happens in dialogs.

- Open patient header with square identity tile, name, tone-mapped status badge, contact line, **one divided stat strip** (Visits | Completed | Pending | Balance — a single bordered card with internal dividers, not four floating KPI cards), action row (Book appointment is the primary action), underline tabs: Overview, Appointments, Medical Info, Documents, Payments (five tabs — Messages was folded into the Overview timeline + inbox deep links).
- **All sub-records (medications, health items, treatment items, provider notes, follow-up reminders, payments, documents, gallery images) are managed through "+ Add" dialogs with edit and delete row actions** — never always-visible inline creation forms. Deletes confirm in a small dialog.
- **Overview:** a short left profile sidebar (identity, contact/profile flex rows, patient notes when present, Edit profile, upcoming appointment) — treatment plan and reminders do NOT live in the sidebar; they belong to their tabs. Right side: two compact cards (Payment snapshot, Health notes) above a merged **Recent activity timeline** (appointments, payments, notes, documents, messages in one chronological feed).
- **Appointments:** upcoming appointment panel, history table, reminders (dialog-managed list rows) + recent-visits rail. Reminders live here, not in Medical Info.
- **Medical Info:** main column of stacked list-row sections (Medications, Health record, Treatment plan, Provider notes — each with "+ Add" and row actions) + one merged **Health summary** rail card (only the filled free-text fields + clinical alerts together). Clinical-only data stays here. Don't show fabricated per-row data the model can't back (e.g. per-visit provider).
- **Documents:** upload→dialog metadata flow, click-to-select document table, selected-document rail, category summary showing only non-empty categories.
- **Payments:** ledger-style metrics row (billed vs paid computed separately), payment history table with edit/delete, dialog-based manual entry, tone-aware payment-status rail; statement download produces a CSV.

Avoid: permanent inline forms, append-only records with no correction path, mini-card grids with empty cells, per-field placeholder text, duplicated information, summary cards that restate header KPIs.

### Staff Directory

Table-first like Clients. **No KPI band** — the page is header → toolbar → table.

- Page header with primary action only. Counted filter chips (All / Active / Away / Inactive / Checked in) are the page's summary layer; a role select appears beside them when more than one role exists.
- Status means employment status (Active / Away / Inactive); **checked-in is a separate signal** (small emerald "Checked in now" line under the status) — never conflate the two.
- Rows: square initial tiles; Role pill; Today column shows today's shift (or "Next: …" when none today) with the day's appointment count beneath; completion rate with gradient bar (rendered only when non-zero).
- Row actions: schedule-aware check-in/check-out (outline) beside a primary Details button.
- No pagination furniture — staff lists are small and filter client-side.

Avoid: summary/coverage cards that restate table rows, fabricated metrics (e.g. utilization derived from an assumed capacity), fake pagination footers, right rails.

### Staff Detail

Same read-first open-header structure as Client detail.

- Header: square identity tile, name + tone-mapped status badge, role + contact line (empty fields hidden), conditional shift/checked-in line, **one divided stat strip** (Appts today | This month | Completion | Weekly hours), action row (Check in/out + Edit profile).
- Three tabs: **Overview** (left profile sidebar — identity, contact/status flex rows, staff notes when present, Edit profile, Today shift card — plus a Today's appointments list when any exist and a Recent completed work list), **Schedule** (planned shifts plus a Time tracked this week list — per-entry check-in/out times and durations — as divided list rows, with a Manage shifts link to the edit page), and **Messages** (the staff↔admin thread, with an unread-count dot on the tab trigger when there's anything unseen).
- Appointments/performance data lives in the header strip and Overview lists — no tabs restate it; profile details live in the sidebar, not a separate tab. Messages is a genuinely distinct surface (the admin-facing 1:1 thread), not a restatement of anything else.
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

A clean analytics experience (Pro) or a polished upgrade state (Basic). Reshaped 2026-06 (owner-provided finance-dashboard inspiration) into a **compact three-row page** — every card simple, minimal, and shown exactly once:

- header controls: period pills (daily/weekly/monthly + Custom range when active), a **calendar icon button** that opens a small popover (From/To date inputs + "Analyse range"; both dates required) — never inline date inputs in the header — and Refresh AI, all h-10
- compact paddings (`p-4` cards, `gap-3`) are deliberate; don't re-inflate them — the page scrolls normally like the rest of the workspace, it does not lock to one viewport
- **Row 1 — exactly three KPI cards** (Appointments, Completion rate, New clients), each with an icon tile + label header, a large value with a **tinted delta pill** + comparison caption, and an **embedded mini-chart filling the right half of the card**: Appointments/New clients use **track-style bars** (full-height light ghost track per bucket with the value filling from the bottom; current bucket solid primary — zero buckets show just the track, never tiny stubs), Completion rate uses a **smooth gradient-filled sparkline with a visible end dot**; mini-charts are **interactive** — per-bucket hover shows a "label · value" tooltip. Avg visit length lives in Highlights; Active clients and Unread messages do not belong on Reports.
- **Row 2 — Performance chart (≈2fr) beside the AI insight card (≈1fr)**: the chart renders **edge-to-edge** (container width measured with a ResizeObserver into the SVG viewBox — no letterboxed fixed-aspect SVG) with **smooth monotone-cubic curves** (no overshoot on flat-to-rising data), a **gradient area fill**, a **left y-axis** (0 / mid / max ticks aligned to the gridlines), and **both series on one shared scale** (the Completed line must never be normalized to its own max). No permanent point dots — per-bucket hover shows the guide line, both series' dots, and the "N appointments · M completed" tooltip. The AI card is **recommendation-style divided rows** — status badge top-right, then Summary / Diagnosis / Next move rows (label + severity/priority pill, one bold line, one clamped detail line) and a **footer pill "Operational health score: N/100"** with a tone-colored dot. No score ring, no audit footer.
- **Row 3 — Appointment status donut (left) + Highlights card (right)**: an **SVG segment donut** (size-32, rounded segment caps with small gaps, total visits centered) beside divided legend rows that show **all four statuses including zero counts** (zero rows muted, "count · %", dot colors matching segments); the donut is **interactive from both sides** — hovering a segment or its legend row thickens that segment, fades the others, and swaps the center to that segment's count/label. Highlights is up to four **bordered icon rows** (title + one-line plain-English detail): Busiest window, Estimated utilization (with its basis), Top provider, Average visit length — replacing the old Operational detail, Client mix, and Demand & staff load cards, which were removed.
- Period switches fade content in (~160ms), the KPI cards stagger subtly, and the date-range popover scales in from its trigger (~150ms).

**The delta rule:** a delta always means "change vs the previous period"; point-in-time numbers carry no delta and no trend arrow. Capacity-derived utilization is labeled **"Estimated utilization"** with its basis stated, and lives in Highlights, not the KPI row.

Sparse data uses natural-height compact empty/status states; the trend chart is hidden when no chart bucket has appointments. Custom date ranges always use rule-based analysis and say so; AI insights clearly indicate when rule-based fallback was used.

Avoid: four-or-more KPI tiles, tall disconnected AI rails, masonry-like card placement, large blank chart areas, the same metric in two cards, dense metric-table cards (Operational detail-style), synthetic deltas/trends on point-in-time numbers.

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

- Back link, page title, centered form container, sectioned form cards, consistent field spacing, clear save/cancel actions.
- Dedicated create pages exist at `/calendar/new`, `/clients/new`, `/staff/new`; full-page edit routes at `/clients/[id]/edit`, `/staff/[id]/edit`, `/calendar/[id]/edit`.

Avoid: stretched full-width forms, inconsistent field alignment, too many unrelated sections on one screen.

### Marketing Site

- `/` opens with the day dial: 08:00 to 18:00 around a clock face, one ring per staff member, each arc an appointment, lunch blocked across all rings; a hand sweeps the day (done visits dim, current ones light up, the centre reads "Now · staff, patient, service"), and pointing at an arc reads that visit. Then the module strip (the six drawn glyphs, shared with /product, sliding endlessly; pointing at one lights it and dims the rest), the pinned "A day at the clinic" story: a clock from 08:00 to 18:00, the section light drifting from morning white to an ink evening, a stage card playing one honest scene per moment (reminder, record, message, moved visit, payment, report), and day-bar dots that jump to a moment. Mobile and reduced motion get the scenes as a stack. Then the feature bento (its last card is the record hub: the six modules wired into one patient record, pulses running along the wires), the reminder builder (visitors toggle template tokens and see the message Maya receives; clinical tokens render empty, exactly as `renderReminder` does), the shared plan strip, the testimonial wall, and the footer CTA.
- `/product` opens with a rolling-word headline over a module rail (drawn glyphs; hovering takes over the headline, clicking opens that module in the explorer), then the auto-advancing module explorer (vertical tabs whose progress bar is the timer; each module has its own full-height content visual: a staff day calendar, a patient record, a shift timeline with a now line, an inbox list, a payments statement with files, and an 8-week completion chart with an AI-assisted note), then the record story: the steps scroll down on the left (the owner preferred this natural scroll to a pinned stage), each hidden until it reaches the viewport and then building itself in (top rule draws, number, title, copy, and entry chips rise out of a blur in turn), while Maya's sticky record on the right starts empty and each entry slides in one by one as its step reaches the middle. The last step is kept exactly as tall as the record (measured), so on the last step the two stop with their tops level and leave together. Pointing at a step lights its chips and its record rows (others dim); pointing at a row lights its step. After it, a quiet light recap: "Five steps, one record. Nothing typed twice." beside one line of five ticked steps (Profile, Booking, Visit, Follow-up, Reports) that fills as it scrolls in. Its scroll-linked values go through `useRange` (a JS-side transform) because framer-motion otherwise hands plain `useTransform` ranges to the browser's native scroll timeline, which can map offsets differently.
- `/pricing` shows the plans above the fold as the same shared plan strip the home page uses (`shared/plan-strip.tsx`; the owner preferred it to plan-card towers, which were removed), then the plan finder (three yes/no questions, each tied to a Pro-only feature, with a verdict card that turns ink for Pro and says why), the grouped comparison table (daily work / insight / support; pointing at a plan lights its whole column), and the FAQ as a side-by-side reader (questions left, one answer right). No accordions, no closing CTA band; the plans are the CTA.
- `/about` is a centered manifesto, then the converging tools (a "Six places. One record." header and a checklist on the left that ticks each source off as its scrap, from a paper diary, spreadsheet, phone, sticky note, email, or notebook, flies into Maya's one record on the right), a large scroll-linked statement, the operating loop (four step cards across the width, Configure / Operate / Understand / Improve, each with a small honest visual at its foot, joined by arrows and a return line that closes the loop), and the "What stays true" card, closing on a split line ("Run the day. Don't chase it." beside the ask), not the shared CTA band.
- `/contact` puts the headline and the form in the opening; minimal: no cards, underline fields, topic chips, and the support address as a quiet link; the form hands off to the visitor's email app (no email provider is wired yet) and says so.
- Auth pages (`/login`, `/sign-up`, password reset, email confirmation) share `AuthSplitShell`: form column left (brand, back-to-site link, legal links), ink panel right with the module orbit (the six module glyphs riding a slow ring around the Vela mark, wired to it; the lit module cycles and pulses into the centre, pointing at a tile pauses the ring and reads that module out, the stage tilts toward the pointer) above the promise and three plain facts. Ink submit buttons, show/hide password, a live 8-character hint on sign-up. No glass proof tiles, no compliance claims.
- `/checkout` is a split like the auth pages: the left side has the brand and back link, a badge and headline, two selectable plan cards, a three-step activation bar (account, workspace, activation, filled from the visitor's real state), and one line on how activation works today. The right side is ink with the summary printed as a receipt (torn edge, the plan's features, workspace and status, next step) that re-prints when the plan changes. The pay button stays visibly locked until Paddle is wired; the real next step (create account / onboarding / talk to us) is the solid button. No gradient summary card, no popularity badges.
- Legal pages (`/terms-and-conditions`, `/privacy`, `/refund`) render inside the marketing shell with a policy switcher and a scroll-tracking table of contents whose rail fills with reading progress (percent read and an honest reading time). Legal wording changes beyond factual product accuracy need a lawyer's review; the GDPR legal assessment is still outstanding.
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
