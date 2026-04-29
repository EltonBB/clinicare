# Project Status: Vela / Clinicare

Last updated: 2026-04-29

## Product Overview

Vela / Clinicare is a SaaS workspace for clinics and appointment-based businesses. The app helps a clinic manage onboarding, branding, clients, staff, bookings, WhatsApp conversations, reminders, reports, and AI-assisted performance insights from one workspace.

The core product direction is customer-first: clinics should not need to understand Twilio, Meta, Supabase, Prisma, or OpenAI. Provider complexity should stay behind simple product language and support-friendly states.

## Technical Stack

- Next.js 16.2.2 App Router with React 19.
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
- Calendar with appointment creation, searchable client picker, staff assignment, operating-hours protection, status handling, and calendar appointment layout.
- Clients workspace with add/edit/archive, profile tabs, history, notes, messages, details, and client gallery image records with captions.
- Staff workspace separated from Settings, including staff profiles, active/away/inactive status, check-in/check-out time tracking, monthly completed appointment records, and recent completed work.
- Inbox with WhatsApp conversations, unread counts, unknown-contact handling, conversion to client, outbound replies, and live notification updates.
- WhatsApp setup moved to Settings with simplified customer-facing connection state, connect/retry, and refresh actions.
- Reminder settings with configurable first and second reminder hours and editable reminder template.
- Appearance/branding settings with app accent color and logo update support.
- Private Supabase Storage-backed uploads for clinic logos and client gallery images, with Prisma/auth metadata storing storage references and the UI resolving short-lived signed display URLs.
- Reports page with daily, weekly, and monthly metrics, charts, snapshots, and AI-generated or fallback recommendations.
- First-user workspace tour redesigned as a clean coachmark flow that avoids highlight rings, pauses while drawers/modals are open, and persists completion.

## Current Working Flows

- A new user can sign up, confirm email, complete onboarding, and enter the dashboard.
- A clinic can configure branding, hours, staff, and dashboard widgets during onboarding or later in Settings.
- A clinic can create clients and then book appointments using those clients.
- Appointments show on the dashboard/calendar and feed staff/client records when completed.
- Staff can be managed from the Staff page and tracked with check-in/check-out.
- Client records can hold appointment history, notes, messages, and private Supabase-hosted gallery images.
- The Twilio WhatsApp test sender can receive inbound messages, create conversations, reply from Inbox, and convert unknown contacts to clients.
- Reports can calculate core performance metrics and refresh AI analysis when the OpenAI environment key is configured.

## Known Issues / Blockers

- True customer-owned WhatsApp number onboarding is not production-ready until the required Twilio Tech Provider / Meta Embedded Signup business setup is available.
- WhatsApp currently relies on the configured Twilio sender/test setup for validation.
- AI reports need a valid server-side OpenAI API key in production; otherwise the app must use fallback rule-based analytics.
- Supabase media storage uses a private `clinic-media` bucket with authenticated per-user folder policies applied.
- Billing/plan enforcement is partially represented in UI; full paid upgrade/payment flow still needs production implementation.

## Next Priorities

1. Stabilize and test the full first-user flow on a clean account: signup, confirm email, onboarding, dashboard, tour, client, booking, staff, reports.
2. Verify completed appointment automation end-to-end: completed appointments leave active calendar views and appear in staff/client records.
3. Smoke-test signed logo/gallery upload and display against the live production app.
4. Harden reports and AI analytics refresh for daily/weekly/monthly periods with clear fallback behavior and cost controls.
5. Continue WhatsApp provider work only after business/provider requirements are ready; keep Settings flow customer-friendly in the meantime.
6. Implement real billing/plan upgrade flow when pricing and payment provider decisions are final.

## Testing Checklist

- `npm run lint`
- `npm run build`
- New account signup and email confirmation.
- Onboarding from owner step through completion.
- Dashboard loads with correct local date and selected widgets.
- First-user tour appears once, avoids modals/drawers, and stays completed after finishing.
- Create client, edit client, archive client.
- Upload/add client gallery image record and caption.
- Create appointment inside operating hours and verify blocked behavior outside operating hours.
- Verify completed appointment movement into staff/client records.
- Staff add/edit/archive and check-in/check-out.
- Inbox inbound WhatsApp, outbound reply, unread count, and convert-to-client.
- Settings: WhatsApp status, reminders, branding, logo, plan display.
- Reports: daily, weekly, monthly metrics and AI/fallback snapshot refresh.

## Last Completed Task

- Configured the private Supabase `clinic-media` bucket with authenticated per-user folder policies for read/upload/update/delete. Previous media-storage code was pushed to GitHub and deployed on Vercel; next step is live upload/display smoke testing.
