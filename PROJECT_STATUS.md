# Project Status: Vela / Clinicare

Last updated: 2026-05-20

## Product Overview

Vela / Clinicare is a SaaS workspace for clinics and appointment-based businesses. The app helps a clinic manage onboarding, branding, clients, staff, bookings, WhatsApp conversations, reminders, reports, and AI-assisted performance insights from one workspace.

The core product direction is customer-first: clinics should not need to understand Twilio, Meta, Supabase, Prisma, or OpenAI. Provider complexity should stay behind simple product language and support-friendly states.

## Technical Stack

- Next.js 16.2.6 App Router with React 19.
- TypeScript, Tailwind CSS 4, shadcn-style UI components, Radix primitives, Lucide icons.
- Prisma with PostgreSQL via Supabase.
- Supabase Auth for email/password authentication and email confirmation.
- Vercel production deployment from Git.
- Twilio WhatsApp integration for live sender testing and webhook-based inbox messaging.
- OpenAI-backed analytics snapshots with rule-based fallback when AI is unavailable.

## Completed Features

- Auth flow with signup, login, email confirmation, reset password, and oversized-session/header hardening.
- Multi-step onboarding after email confirmation:
  - owner name
  - clinic name/type
  - optional logo URL/upload handling
  - brand accent color
  - operating hours
  - staff setup
  - dashboard widget preferences
  - completion page leading to dashboard
- Workspace shell with left navigation, top app bar, owner account dialog, notifications, plan card, and first-user tour.
- Dashboard with configurable widgets, quick actions, daily overview, today appointments, last clients, staff appointment preview, unread messages, and analytics widget.
- Calendar with appointment creation, searchable client picker, staff assignment, operating-hours protection, status handling, optional booking-time payment capture, calendar appointment layout, and full-page appointment editing at `/calendar/[appointmentId]/edit`.
- Clients workspace with a full-width directory, Details-only row actions, dedicated patient record pages, doctor-facing overview summaries, full-page patient edit flow, MVP patient tabs, appointment history, real patient demographics, medical profile fields, medications, documents/images, messages, booking-linked payment records, archive controls, and private gallery image records with captions.
- Staff workspace separated from Settings, including staff profiles, dedicated staff details/edit pages, active/away/inactive status, row-level check-in/check-out quick actions, monthly completed appointment records, and recent completed work.
- Inbox with WhatsApp conversations, unread counts, unknown-contact handling, conversion to client, outbound replies, and live notification updates.
- WhatsApp setup moved to Settings with simplified customer-facing connection state, connect/retry, and refresh actions.
- Reminder settings with configurable first and second reminder hours and editable reminder template.
- Appearance/branding settings with app accent color and logo update support.
- Private Supabase Storage-backed uploads for clinic logos and client gallery images, with Prisma/auth metadata storing storage references and the UI resolving short-lived signed display URLs.
- Supabase public application tables now have Row Level Security enabled so the browser-exposed Supabase anon API cannot read or write Prisma application data without explicit policies.
- Reports page with daily, weekly, and monthly metrics, charts, auditable snapshots, full three-timeframe AI refresh, deeper operational diagnostics, root-cause analysis, recommended playbooks, monitoring targets, AI-generated recommendations, metric-driven snapshot scoring, data-backed fallback guidance, customer-safe snapshot metadata, rule-based fallback states, and refresh cooldown protection.
- Public legal policy pages for Terms of Service, Privacy Policy, and Refund Policy at `/terms-and-conditions`, `/privacy`, and `/refund`, with Vela-specific SaaS, clinic data, messaging, media, AI reports, billing, cancellation, and refund language.
- First-user workspace tour redesigned as a clean coachmark flow that avoids highlight rings, pauses while drawers/modals are open, and persists completion.
- Security/performance hardening pass completed: Next Proxy protects all workspace routes including `/staff`, global security headers are configured, user-facing provider/database errors are generic, private media uploads are limited to common raster image formats, email verification receipt updates cannot create arbitrary verified tickets, and expensive client/staff/reminder queries are capped or simplified.
- Workspace navigation performance pass completed: dynamic workspace routes now have an instant loading shell, all sidebar/mobile nav items use client-side prefetched links, workspace auth/business lookups are request-deduped, non-critical maintenance work runs after the response, and inbox/settings data loads are capped for faster page opens.
- Workspace performance cleanup pass completed: the shared shell no longer blocks navigation on notification preview queries, first-user tour code only loads when needed, Clients and Staff directory pages use lightweight list queries, Settings no longer loads or saves staff records, Calendar loads a bounded appointment window, Inbox polling and lookup data are capped, Dashboard unread messages use an aggregate query, stale drawer-era links were replaced with dedicated detail/edit routes, unused UI wrappers/global providers were removed, and unused dependency packages were pruned.
- Workspace shell refinement completed: the authenticated app keeps the existing card-based page designs while using a straighter desktop sidebar and top toolbar, a real global search bar that searches clients, appointments, staff, and message conversations, flatter clinic/account identity chips without tinted avatar shadows, and slightly straighter shared card radius across the app.
- Workspace depth redesign implementation pass completed: dashboard, clients directory, staff, calendar schedule blocks, mobile/global search, inbox deep links, and client detail tabs now use denser screenshot-aligned workspace structures with KPI rows, operational tables, right-side rails, compact panels, and working database-backed patient depth.
- Corrective visual pass added after review feedback: Calendar now has the screenshot-style page header and right rail, Reports uses a flatter page-level header plus dense metric cards, Inbox has a page-level summary header, and the shared shell/background were tightened toward the supplied white/purple-blue workspace references.
- Second corrective workspace redesign pass completed after screenshot mismatch review: the shared shell now uses the reference-style Vela brand block, separate clinic identity block, centered top search rhythm, and tighter sidebar width; Client detail now uses an open patient header with right-side KPI cards, action row, underline tabs, and screenshot-style Overview grid with dynamic profile/care/upcoming/treatment/health/document/message/payment panels; Reports now uses the reference-style six-card KPI row, performance chart, client mix donut, operational metrics, appointment status, detailed breakdown, demand windows, staff load, and right-side AI insights rail; Dashboard, Clients, and Staff were tightened to the same max-width, title, card, search/filter, and dense table rhythm.
- Professional compact workspace pass completed: Staff now uses a denser reference-style KPI/table/right-rail layout with real appointments-today, completion-rate, and StaffShift-backed shift data instead of fabricated shift rows; staff details/edit/action queries now include shift data. Client detail tabs were tightened further: Appointments now uses an upcoming appointment panel, history table, reminders/recent-visits rail, and compact actions; Documents now uses upload controls, document table, selected-document metadata, and category summary rail; Payments now uses a ledger-style metrics row, payment history table, manual ledger form, and payment-status rail. Dashboard, Calendar, Inbox, Settings, Staff details, and the shared shell were also tightened to reduce excess vertical whitespace and visible empty rail gaps.
- Latest workspace alignment pass completed after marked screenshot review: Vela branding moved out of the desktop sidebar and into the top toolbar, the sidebar now starts with the clinic identity, Staff exposes real shift/schedule data in the table and a team schedule panel, Staff detail now uses the same open-header/tabbed record structure as client detail, and Dashboard/Clients/Client detail right rails received additional dynamic panels to reduce visible empty space.
- Workspace structure audit pass completed: repeated Quick Actions rails were removed from Calendar, Clients, Staff, Staff detail, and Client detail tabs where the actions duplicated page headers or were not page-specific. Those areas now use dynamic summaries instead. Calendar utilization now derives from the selected view and saved business hours, Reports appointment status now uses the actual status mix instead of a fixed completed donut, Client payments now compute billed vs paid separately, and payment statement download now produces a CSV instead of being an inert button.
- Product-finish pass completed: Reports now uses tighter cards/charts and URL-backed single-date plus custom from/to range analysis, Calendar has a direct date jump control, Dashboard customization now actually hides/shows the selected dashboard sections, Staff add/edit now saves a seven-day shift schedule, Staff check-in/check-out is schedule-aware and exposed directly in Staff table rows beside a Details button, Clients directory rows now show latest appointment service/provider/notes context, and Client detail Medical/Appointment tabs were reorganized so reminders live with appointments while clinical-only data stays in Medical Info.
- Prisma schema now includes structured client health records, provider care notes, treatment plan items, client follow-up reminders, staff shifts, and schedule blocks. Client documents now support private PDF/image storage metadata, and client payments now support manual ledger metadata such as invoice number, receipt number, payment method, billing note, and payment date.
- Public marketing landing page at `/` now uses a simplified animated product-led design inspired by the Dribbble reference, with the default Vela blue accent color, a large hero, floating clinic workspace mockups on desktop, a cleaner stacked mobile preview, compact workflow blocks, AI reporting, privacy messaging, and signup/login CTAs into the auth flow.
- Public marketing site expanded from a single landing page into a five-page static route structure: `/`, `/product`, `/pricing`, `/about`, and `/contact`. The pages now share a reusable marketing shell, Vela-blue product-led design system, responsive header/footer, richer Vela workspace screenshot-style product media, pricing cards, About/legal links, and contact/demo form layout.
- Public marketing site redesigned again with the supplied Vela brand-scene assets instead of flat screenshots or generated replacements. The Home/Product pages now use a Cal.com-inspired minimal hero, large branded monitor visuals, workflow steps, feature image sections for scheduling, clients, and reports, stronger CTAs, improved motion, and mobile-safe responsive structure.
- Public checkout preparation page now exists at `/checkout`. Pricing plan buttons route to `/checkout?plan=basic` or `/checkout?plan=pro`, the page renders the selected plan summary and feature list, detects the signed-in workspace's current plan/status, labels the checkout as first purchase, current plan, upgrade, downgrade, or reactivation, and keeps the final payment button reserved for the future Paddle checkout handoff.
- Fixed the shared Tabs primitive so horizontal tabs explicitly render as a vertical stack of tab list above tab content. This resolves the client details page issue where the tab list appeared in a left empty column and the overview content was pushed to the right.
- Dedicated create pages now exist for `/calendar/new`, `/clients/new`, and `/staff/new`, replacing the main add flows for bookings, clients, and staff with centered single-page forms while preserving edit sheets for existing records.
- Dedicated patient details pages now exist at `/clients/[clientId]`, replacing the old right-side client panel with a full patient record view covering Overview, Appointments, Medical Info, Documents, Messages, Payments, edit/archive actions, real medication/document creation, and payment ledger records generated from bookings.
- Dedicated patient edit pages now exist at `/clients/[clientId]/edit`, replacing the old right-side edit drawer with a full-page form for demographics, clinic information, and medical profile fields.
- Dedicated staff details and edit pages now exist at `/staff/[staffId]` and `/staff/[staffId]/edit`, replacing the old right-side staff drawer with full-page staff records.

## Current Working Flows

- A new user can sign up, confirm email, complete onboarding, and enter the dashboard.
- A clinic can configure branding, hours, staff, and dashboard widgets during onboarding or later in Settings.
- A clinic can create a lightweight patient record first, then add deeper medical history from the patient edit page as the relationship develops.
- A clinic can book appointments using those clients, record the expected or collected service payment during booking, and edit existing bookings from a dedicated page.
- A clinic can open each patient from the directory into a dedicated full-page record with basic information, care summary, appointment context, medical information, current medications, media/document records, messages, and a payment ledger.
- Appointments show on the dashboard/calendar and feed staff/client records when completed.
- Staff can be managed from the Staff page, opened into full details pages, edited from full-page forms, and tracked with row-level check-in/check-out.
- Client records can hold appointment history, notes, messages, and private Supabase-hosted gallery images.
- The Twilio WhatsApp test sender can receive inbound messages, create conversations, reply from Inbox, and convert unknown contacts to clients.
- Reports can calculate core performance metrics, derive operational evidence from appointment status mix, demand windows, staff load, booking lead time, and client mix, refresh AI analysis across daily/weekly/monthly together when the OpenAI environment key is configured, score each timeframe from current clinic metrics, generate rule-based guidance from actual period data, handle sparse/unmeasured data without false zeros, and clearly show when rule-based insights are used instead.
- Workspace page-to-page navigation keeps the shared shell interactive and shows a skeleton immediately while dynamic page data streams in.
- Public visitors now land on the marketing homepage first, with signup/login CTAs routing into the existing auth flow.
- Public visitors can browse Home, Product, Pricing, About, Checkout, and Contact pages without authentication, while legal pages remain available at `/terms-and-conditions`, `/privacy`, and `/refund`.
- Marketing pages use supplied Vela-styled product scene imagery with sample names and data so prospects see realistic Vela workflows without exposing live customer information.
- Patient detail tabs now align correctly above the Overview, Appointments, Medical Info, Documents, Messages, and Payments content instead of splitting the tabs and content into separate columns.
- The top workspace toolbar now includes an authenticated global search API at `/api/search`; the desktop search box returns app records without exposing cross-clinic data.
- Global search now supports keyboard result selection, client-side navigation, mobile search access, and message-result deep links to the matching inbox conversation.
- Patient records can now store structured health items, provider notes, treatment plan rows, follow-up reminders, private PDF/image documents, and manual ledger entries from the client details page.
- Calendar schedule blocks are stored in the database through server actions and rendered into calendar day/week/month views as blocked time.
- Staff shift server actions now exist for business-scoped shift create/update/delete; the Staff page now derives the visible on-duty rail, table shift column, team schedule panel, and staff detail schedule summary from current staff status, time tracking, appointments, and StaffShift records.

## Known Issues / Blockers

- True customer-owned WhatsApp number onboarding is not production-ready until the required Twilio Tech Provider / Meta Embedded Signup business setup is available.
- WhatsApp currently relies on the configured Twilio sender/test setup for validation.
- AI reports need a valid server-side OpenAI API key in production; otherwise the app records an auditable fallback snapshot and clearly shows that rules are being used.
- Reports AI manual refresh uses a short cooldown to control cost and prevent accidental repeated refreshes.
- Supabase media storage uses a private `clinic-media` bucket with authenticated per-user folder policies applied.
- Supabase database tables use RLS with no public table policies; app data access is intentionally server-side through Prisma. Newly added patient medication, document, and payment tables also have RLS enabled.
- Dependency audit is currently clean after updating Next.js to 16.2.6, refreshing transitive dependencies, and overriding PostCSS to a patched version.
- Billing/plan enforcement is partially represented in UI; `/checkout` now identifies whether the selected plan is a first purchase, current plan, upgrade, downgrade, or reactivation for signed-in workspaces, but the full Paddle payment session creation, webhook handling, and plan activation flow still need production implementation.
- The workspace depth Prisma schema has been applied to the configured Supabase Postgres database with `npx prisma db push`, and the RLS enablement SQL has been run for the new public application tables.
- Browser-render verification of authenticated workspace pages was limited by the Playwright context redirecting to `/login` without a signed-in workspace session. Static/type/build verification passed; signed-in visual QA should be run with a real test account after the database schema is applied.
- Latest browser verification still cannot inspect authenticated workspace visuals from Codex because protected routes redirect to `/login` without a reusable signed-in Supabase session. The app correctly enforces the auth boundary; signed-in visual QA remains the next required step using a real workspace account. Static verification for the latest product-finish pass passed with `npm run lint`, `npm run build`, and `npm audit --omit=dev`; Playwright verified the protected `/reports` route redirects to `/login` when unauthenticated.

## Next Priorities

1. Run signed-in desktop/mobile visual QA against dashboard, calendar, reports, staff, staff detail, clients, client detail tabs, inbox, settings, and create/edit forms with a real test workspace, comparing against the supplied reference screenshots and checking remaining alignment/empty-space issues.
2. Stabilize and test the full first-user flow on a clean account: signup, confirm email, onboarding, dashboard, tour, client, booking, staff, reports.
3. Verify completed appointment automation end-to-end: completed appointments leave active calendar views and appear in staff/client records.
4. Smoke-test private signed logo/gallery/document upload, display, download/preview, replacement cleanup, and client-delete media cleanup against the live production app.
5. Continue hardening reports with any launch-specific wording, prompt evaluation, or plan-gating requirements that come out of user testing.
6. Continue WhatsApp provider work only after business/provider requirements are ready; keep Settings flow customer-friendly in the meantime.
7. Implement the Paddle billing flow behind `/checkout`: product/price IDs, checkout session creation, success/cancel handling, webhook verification, subscription state sync, and plan activation.
8. Keep production deployment to the GitHub integration path only; avoid direct Vercel CLI deploys so each pushed commit creates one deployment.

## Testing Checklist

- `npm run lint`
- `npm audit --omit=dev`
- `npm run build`
- `npm audit --omit=dev`
- Signed-in browser visual QA for workspace depth redesign pages after schema apply.
- New account signup and email confirmation.
- Onboarding from owner step through completion.
- Dashboard loads with correct local date and selected widgets.
- First-user tour appears once, avoids modals/drawers, and stays completed after finishing.
- Create client, edit client through `/clients/[clientId]/edit`, archive client.
- Open a client details page from the directory and verify overview, appointment history, medical fields, medications, documents/images, messages, and booking-linked payments.
- Create a booking with a payment amount and verify the payment appears in the patient's Payments tab.
- Upload/add client gallery image record and caption.
- Create appointment inside operating hours and verify blocked behavior outside operating hours.
- Verify completed appointment movement into staff/client records.
- Staff add, details, edit, delete, and row-level check-in/check-out.
- Calendar booking creation and `/calendar/[appointmentId]/edit` save/cancel/delete behavior.
- Inbox inbound WhatsApp, outbound reply, unread count, and convert-to-client.
- Settings: WhatsApp status, reminders, branding, logo, plan display.
- Reports: daily, weekly, monthly metrics, metric-driven snapshot scores, sparse-data states, full three-timeframe AI refresh, diagnosis/root-cause/playbook sections, detailed suggestions, data-backed fallback copy, cooldown behavior, and AI/fallback snapshot states.
- Public policies: `/terms-and-conditions`, `/privacy`, and `/refund` load without authentication and match the current Vela product scope.
- Public homepage: `/` loads without authentication, shows the landing page, and routes `Start free` to `/sign-up` and `Log in` to `/login`.
- Public marketing site: `/`, `/product`, `/pricing`, `/about`, and `/contact` load without authentication, render correctly at desktop and narrow viewport sizes, display generated product imagery from `public/marketing`, and keep CTAs routed to `/sign-up`, `/login`, `/pricing`, `/product`, `/contact`, and the legal pages.
- Public checkout: `/checkout?plan=basic` and `/checkout?plan=pro` load without authentication, show the selected plan details, detect signed-in workspace plan context when available, and keep the payment button disabled until Paddle checkout is wired.
- Supabase security: public Prisma tables report RLS enabled and anon REST table access returns no rows.
- Route protection: `/dashboard`, `/calendar`, `/clients`, `/staff`, `/inbox`, `/reports`, and `/settings` redirect unauthenticated users to login.

## Last Completed Task

- Added checkout plan-state recognition for Paddle preparation. `/checkout` now reads the signed-in workspace plan/status when available, labels the selected plan as first purchase/current/upgrade/downgrade/reactivation, shows current account context in the checkout summary, and routes billing/pro-lock CTAs into checkout instead of generic pricing. Verified with `npm run lint`, `npm run build`, and `npm audit --omit=dev`.
