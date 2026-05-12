# Project Status: Vela / Clinicare

Last updated: 2026-05-12

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
- Public marketing landing page at `/` now uses a simplified animated product-led design inspired by the Dribbble reference, with the default Vela blue accent color, a large hero, floating clinic workspace mockups on desktop, a cleaner stacked mobile preview, compact workflow blocks, AI reporting, privacy messaging, and signup/login CTAs into the auth flow.
- Public marketing site expanded from a single landing page into a five-page static route structure: `/`, `/product`, `/pricing`, `/about`, and `/contact`. The pages now share a reusable marketing shell, Vela-blue product-led design system, responsive header/footer, product mockups, pricing cards, About/legal links, and contact/demo form layout.
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
- Public visitors can now browse Home, Product, Pricing, About, and Contact pages without authentication, while legal pages remain available at `/terms-and-conditions`, `/privacy`, and `/refund`.

## Known Issues / Blockers

- True customer-owned WhatsApp number onboarding is not production-ready until the required Twilio Tech Provider / Meta Embedded Signup business setup is available.
- WhatsApp currently relies on the configured Twilio sender/test setup for validation.
- AI reports need a valid server-side OpenAI API key in production; otherwise the app records an auditable fallback snapshot and clearly shows that rules are being used.
- Reports AI manual refresh uses a short cooldown to control cost and prevent accidental repeated refreshes.
- Supabase media storage uses a private `clinic-media` bucket with authenticated per-user folder policies applied.
- Supabase database tables use RLS with no public table policies; app data access is intentionally server-side through Prisma. Newly added patient medication, document, and payment tables also have RLS enabled.
- Dependency audit is currently clean after updating Next.js to 16.2.6, refreshing transitive dependencies, and overriding PostCSS to a patched version.
- Billing/plan enforcement is partially represented in UI; full paid upgrade/payment flow still needs production implementation.

## Next Priorities

1. Stabilize and test the full first-user flow on a clean account: signup, confirm email, onboarding, dashboard, tour, client, booking, staff, reports.
2. Verify completed appointment automation end-to-end: completed appointments leave active calendar views and appear in staff/client records.
3. Add full PDF/document binary upload support if clinics need files beyond image/scan uploads.
4. Smoke-test signed logo/gallery upload, display, logo replacement cleanup, and client-delete media cleanup against the live production app.
5. Continue hardening reports with any launch-specific wording, prompt evaluation, or plan-gating requirements that come out of user testing.
6. Continue WhatsApp provider work only after business/provider requirements are ready; keep Settings flow customer-friendly in the meantime.
7. Implement real billing/plan upgrade flow when pricing and payment provider decisions are final.

## Testing Checklist

- `npm run lint`
- `npm audit --omit=dev`
- `npm run build`
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
- Public marketing site: `/`, `/product`, `/pricing`, `/about`, and `/contact` load without authentication, render correctly at desktop and narrow viewport sizes, and keep CTAs routed to `/sign-up`, `/login`, `/pricing`, `/product`, `/contact`, and the legal pages.
- Supabase security: public Prisma tables report RLS enabled and anon REST table access returns no rows.
- Route protection: `/dashboard`, `/calendar`, `/clients`, `/staff`, `/inbox`, `/reports`, and `/settings` redirect unauthenticated users to login.

## Last Completed Task

- Completed the public marketing site refactor. Home, Product, Pricing, About, and Contact now use dedicated static routes with a shared marketing shell and responsive Vela-blue SaaS design. Removed the old unused pricing component. Verified with lint, production build, vulnerability audit, HTTP smoke checks for public/legal routes, and Chrome headless desktop/narrow screenshots.
