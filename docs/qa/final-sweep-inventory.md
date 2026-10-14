# Final sweep — inventory (Phase 1, 2026-10-12)

Checklist the rest of the sweep runs against. Built from `main` at `9e30e5f`.

## Pages (35)

| Area | Routes | Guard |
|---|---|---|
| Marketing / legal | `/`, `/product`, `/pricing`, `/about`, `/contact`, `/checkout`, `/privacy`, `/terms-and-conditions`, `/refund` | Public |
| Auth | `/sign-up`, `/login`, `/confirm-email`, `/auth/confirm/continue`, `/forgot-password`, `/reset-password`, `/reset-password/confirm` | Public (rate-limited actions) |
| Onboarding | `/onboarding`, `/onboarding/complete` | Signed in |
| Workspace | `/` (workspace index), `/dashboard`, `/calendar`, `/calendar/new`, `/calendar/[appointmentId]/edit`, `/clients`, `/clients/new`, `/clients/[clientId]`, `/clients/[clientId]/edit`, `/staff`, `/staff/new`, `/staff/[staffId]`, `/staff/[staffId]/edit`, `/inbox`, `/inbox/follow-ups`, `/reports`, `/settings` | `proxy.ts` + workspace helpers |

## API routes (23)

| Route | Method | Auth | Rate limit |
|---|---|---|---|
| `/api/auth/email-verification-status` | GET | none (public poll) | per IP |
| `/api/clients/search` | GET | `getCurrentUser` | `client-search:<user>` |
| `/api/search` | GET | `getCurrentUser` | `search:<user>` 30/10s |
| `/api/cron/{analytics,follow-ups,reminders,storage-cleanup}` | GET | `isAuthorized` (CRON_SECRET) | — |
| `/api/webhooks/whatsapp/baileys` | POST | HMAC + timestamp (`verifyWebhookSignature`) | — |
| `/api/mobile/v1/auth/redeem` | POST | access code | `mobile-redeem:<ip>` + per business |
| `/api/mobile/v1/*` (14 others) | GET/POST | `requireStaffContext` (device token; plus `mobile-auth:<ip>` 600/min) | per device, per action (10–90/min) |

Mobile endpoints: `me`, `clock`, `devices`, `auth/logout`, `appointments`, `appointments/[id]`, `appointments/[id]/cancel`, `notifications`, `notifications/[id]/read`, `notifications/read-all`, `threads`, `threads/[id]`, `threads/[id]/messages`, `threads/[id]/read`.

## Server actions (72 in 11 files) — the UI's buttons and forms

Every signed-in action goes through the workspace helpers, which apply the per-user budget (`actions:<user>`, plus `background-actions:<user>` for background acknowledgements).

| File | Actions | UI surface |
|---|---|---|
| `(auth)/actions.ts` | signUp, login, resendConfirmation, logout, forgotPassword, resetPassword, confirmPasswordRecovery, confirmEmailLink, updateOwnerProfile | Auth pages; profile in the shell (per-IP limits; owner re-auth per user) |
| `(workspace)/actions.ts` | refreshWorkspaceNotifications | Topbar notifications |
| `calendar/waitlist-actions.ts` | addWaitlistEntry, removeWaitlistEntry | Calendar waiting list (Pro) |
| `calendar/actions.ts` | saveAppointment, cancelAppointment, recordAppointmentAttendance, getNoShowRisk, deleteAppointment, loadCalendarMonth | Calendar, quick view, booking form, edit page |
| `clients/actions.ts` | saveClient, deleteClient, updateClientMedicalBackground, add/update/delete × Medication, HealthItem, CareNote, TreatmentPlanItem, FollowUpReminder, Payment, Document; add/delete GalleryItem (26) | Client directory, detail tabs, dialogs, forms |
| `inbox/actions.ts` | refreshInbox, hydrateConversation, markConversationRead, sendInboxMessage, deleteConversation, convertConversationToClient | Inbox |
| `inbox/follow-ups/actions.ts` | sendFollowUpDraft, bookFollowUpSlot, dismissFollowUpDraft, passSlotOffer | Inbox › Follow-ups |
| `reports/actions.ts` | refreshAnalyticsInsights | Reports (cooldown) |
| `settings/actions.ts` | getSettingsData, saveSettings, saveWorkflowSettings, discardUnsavedLogo, connectBaileysWhatsApp, getBaileysPairingStatus | Settings dialog (pairing 5/min per business) |
| `staff/actions.ts` | saveStaff, deleteStaff, checkInStaff, checkOutStaff, generateMobileAccessCode, revokeMobileAccess, sendStaffMessage, markStaffThreadRead, markStaffCheckInsSeen, getRecentStaffCheckIns, getRecentStaffMessages | Staff directory, detail, Messages tab |
| `onboarding/actions.ts` | saveOnboardingState | Onboarding |

WhatsApp sends also pass `lib/messaging/send-limits.ts` (per business, per window; reply acknowledgements per client).

## Cron (`vercel.json`)

`reminders` hourly :00 · `storage-cleanup` hourly :20 · `follow-ups` hourly :40 · `analytics` daily 02:30.

## Environment variables

Vercel (production + preview), names only, checked 2026-10-12 via the Vercel connector:

| Variable | Read by | Vercel | Note |
|---|---|---|---|
| `DATABASE_URL`, `DIRECT_URL`, `DATABASE_SSL_CA` | Prisma | set | |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase SSR | set | Public by design (RLS on, no policies) |
| `APP_URL` | auth email links | set | |
| `CRON_SECRET` | cron routes | set | |
| `BAILEYS_WORKER_URL`, `BAILEYS_BRIDGE_SECRET`, `BAILEYS_WEBHOOK_SECRET` | messaging bridge, webhook | set | |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (+ `KV_URL`, `REDIS_URL`, read-only token) | rate limiter (Upstash) | set | |
| `OPENAI_API_KEY`, `OPENAI_ANALYTICS_MODEL` | Reports AI | set | |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry | set | |
| `SENTRY_AUTH_TOKEN` | build-time source-map upload | **not set** | Stack traces in Sentry stay minified; check maps aren't served publicly (Phase 2) |
| `SUPABASE_SERVICE_ROLE_KEY` | storage-cleanup retry sweep only | **not set** | Inline deletes work (0 pending rows); the retry sweep is skipped (Phase 7) |
| `EXPO_ACCESS_TOKEN` | push | not set | Known decision; only needed if Expo enhanced security is enabled |
| `APP_TIME_ZONE` / `NEXT_PUBLIC_APP_TIME_ZONE` | time zone | not set | Falls back to the code default |
| `DATABASE_POOL_MAX`, `OPENAI_ANALYTICS_FALLBACK_MODEL`, `NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET`, `NEXT_PUBLIC_APP_URL` | optional | not set | Code defaults apply (`clinic-media`, pool 3) |
| `DEV_ALLOWED_ORIGINS`, `CI`, `NODE_ENV`, `NEXT_RUNTIME` | dev/build only | — | |

Worker (Railway): `APP_URL`, `APP_WEBHOOK_SECRET`, `BAILEYS_BRIDGE_SECRET`, `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `DISABLE_LEGACY_BRIDGE_HEADER`. No Railway CLI or connector here, so presence is inferred from the healthy worker lease; confirm in the Railway dashboard during Phase 7.

## Vela Staff app (vela-mobile-app)

Screens: sign-in (access code), lock, Today, Schedule, appointment detail (cancel), Inbox/thread, Alerts, Profile (clock in/out, sign-out). Talks only to `/api/mobile/v1/*`.
