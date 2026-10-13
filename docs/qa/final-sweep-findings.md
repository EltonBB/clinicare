# Final sweep — findings ledger

Severity: **High** (data exposure, broken core flow) · **Medium** (wrong data, abuse path, degraded feature) · **Low** (hardening, hygiene) · **Info** (noted, no action).

| # | Phase | Severity | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | 1 | Low | `SUPABASE_SERVICE_ROLE_KEY` not set in Vercel, so the hourly storage-cleanup retry sweep is skipped. Inline deletes work. | Vercel env list; `PendingStorageCleanup` has 0 rows | Owner set the key in Vercel 2026-10-12; the 18:20 UTC sweep ran with no "skipped" warning | Fixed |
| 2 | 1 | Info | `SENTRY_AUTH_TOKEN` not set, so source maps aren't uploaded and Sentry stack traces stay minified. | Vercel env list | Owner set the token 2026-10-12; releases now marked deployed in Sentry | Fixed |
| 3 | 2 | Low | Supabase auth cookies had no `Secure` flag (library default). A first plain-http request before HSTS is cached could carry the session. | `@supabase/ssr` `DEFAULT_COOKIE_OPTIONS`; no `cookieOptions` passed | [#150](https://github.com/EltonBB/clinicare/pull/150): shared `authCookieOptions` (`secure` in production) on all three clients | Merged 2026-10-12 |
| 4 | 2 | Low | Supabase Auth "leaked password protection" (HaveIBeenPwned check) is off. | Supabase security advisor `auth_leaked_password_protection` | Not available on the current Supabase plan (owner, 2026-10-12); revisit on upgrade. Login is rate-limited per IP and per account (#151) | Accepted |
| 5 | 2 | Info | Session cookies last 400 days (library default) with no idle sign-out. | `DEFAULT_COOKIE_OPTIONS.maxAge` | Already planned as the auto-logoff safeguard (deferred until the UI work is done) | Deferred |
| 6 | 2 | Info | CSP keeps `'unsafe-inline'` for scripts and styles. Removing it needs per-request nonces, which turn every page dynamic. | Production headers | Conscious trade-off; revisit with the safeguards work | Deferred |
| 7 | 2 | Info | Build tooling advisory `braces` (no fix yet) in the app's dev deps and the staff app's Metro/Jest. Nothing ships to users. | `npm audit`: app and worker production 0; mobile `--omit=dev` lists only build tooling | Watch for an upstream fix | Open |
| 8 | 3 | Medium | Login was throttled per IP only (12/min), so guesses spread across many IPs never hit a ceiling for one account. Supabase sees Vercel's IPs, so its own per-IP limit doesn't help. | `(auth)/actions.ts` `LOGIN_RATE_LIMIT` keyed `login:<ip>` | [#151](https://github.com/EltonBB/clinicare/pull/151): plus 10 per 15 min per account (hashed email key) | Merged 2026-10-12 |
| 9 | 6 | **High** | The Supabase organisation is on the **Free plan**, which has no restorable backups. Lost or wrongly deleted data (a bad migration, an accidental delete) can't be recovered. | `get_organization`: `plan: free` | Owner decision 2026-10-12: backups not available for now (Free plan kept). Revisit before onboarding real clinics' data | Accepted risk |
| 10 | 6 | Low | The worker's DB connection is encrypted but doesn't verify the certificate unless `DATABASE_SSL_CA` is set on Railway (DEPLOY.md calls this "fine for the non-PHI pilot"). | `services/whatsapp-worker/DEPLOY.md` | Owner added `DATABASE_SSL_CA` on Railway 2026-10-13; the redeployed worker took the lease with strict TLS verification | Fixed |
| 11 | 7 | Medium | No alerting: nobody is told if the site goes down, a cron stops, or the worker drops. Sentry only records errors. | No uptime or cron monitors configured | Done 2026-10-12 (owner OK): Sentry uptime monitor on `/login` every 5 min with an email alert "Vela app is down"; cron check-ins in [#153](https://github.com/EltonBB/clinicare/pull/153) (merged; a 200 with `degraded: true` fails the check-in). Sentry refuses `*.railway.app` uptime monitors, so the hourly reminders run checks the worker's lease instead ([#157](https://github.com/EltonBB/clinicare/pull/157)) | Merged 2026-10-13 |
| 12 | 4 | Low | Every account, onboarding and workspace page had the same tab title "Vela" (WCAG 2.4.2 Page Titled, level A). | Page `<title>` checks on production and localhost | [#152](https://github.com/EltonBB/clinicare/pull/152): "<Page> \| Vela" on all 25 pages; record pages kept generic so no patient name lands in history | Merged 2026-10-13 |
| 13 | 2 | Low | Opening a conversation that isn't in the clinic (deleted in another tab, or another clinic's id) crashes the action with a Prisma P2025 instead of returning "not found". No data leaks: the lookup is scoped by `businessId`. | `hydrateConversationAction` with Vela Dent's conversation id from Velucius → `PrismaClientKnownRequestError`; `findFirstOrThrow` in `inbox/actions.ts:78` (the only `OrThrow` on a user-supplied id that isn't preceded by an ownership check) | [#154](https://github.com/EltonBB/clinicare/pull/154): `findFirst` + the existing "Conversation not found" error; Inbox keeps a confirmed send if the thread vanished | Merged 2026-10-13 |
| 14 | 4 | Info | A record page for an id that isn't in the clinic (deleted, mistyped or another clinic's) stays on the loading skeleton on localhost dev, although the server sends the "We couldn't find that" page. | `/clients/<other clinic id>`, `/staff/<…>`; server HTML contains the not-found copy and the 404 marker | Checked on production (owner signed in): the proper "We couldn't find that" page renders. Dev-mode only | Closed (Info) |
| 15 | 4 | Medium | The client, staff and booking forms had no input schema, and the inbox send took any body. A crafted call saved a 50,000-character client name (which would reach reminder messages) and an invalid email, and crashed with a 500 on a non-string field. | Velucius probes on localhost; `saveClientAction` saved a 50k name; `payload.name.trim is not a function` | [#155](https://github.com/EltonBB/clinicare/pull/155): Zod schemas with the sub-record bounds, an email format check; inbox body capped at the seam's 8,000 | Merged 2026-10-13 |
| 16 | 4 | Info | Two separate waiting-list adds for the same client and service both save. The add button is disabled while saving, so only two tabs or a crafted call can do it, and the per-clinic cap still applies. | Two concurrent `addWaitlistEntryAction` calls → two WAITING rows | Not fixed: unlikely, harmless (staff can remove one) | Accepted |
| 17 | 8 | Low | New messages and alerts were easy to miss: the web showed only a 6px dot on Inbox/Staff, and the staff app's tab bar showed nothing at all, nor refreshed open lists. | Owner report on the Android preview build, 2026-10-13 | Web [#158](https://github.com/EltonBB/clinicare/pull/158): count badges on Inbox and Staff (sidebar and mobile nav) plus a "(3)" prefix on the browser tab title, polled in background tabs too. Staff app [vela-mobile-app#25](https://github.com/EltonBB/vela-mobile-app/pull/25): Inbox and Alerts tab badges, a 30 s poll while focused and unlocked, 10 s inside a conversation | Merged 2026-10-13 |

### Phase 2 evidence (passed)

- RLS on all 37 public tables, no policies; run as `anon` and `authenticated`, client, appointment, business, message, device and WhatsApp-key tables return 0 rows. No public function is executable by `anon`. `clinic-media` bucket is private (10 MB, image/PDF only), and storage policies limit each user to their own folder.
- Production JS bundles: no server secrets, keys, DB URLs or provider names; `.js.map` returns 404.
- Headers on production: CSP (`frame-ancestors 'none'`, `object-src 'none'`), HSTS 1 year with subdomains, `nosniff`, `DENY` framing, referrer and permissions policies. `/api/mobile` alone sends CORS headers plus `private, no-store`. (`/` gets Vercel's static `Access-Control-Allow-Origin: *`, harmless on a public, credential-free page.)
- Production probes without credentials: all 4 cron routes give 401 with no secret and with a wrong one; the webhook gives 401 unsigned and with a bad signature; `/api/search` and `/api/clients/search` 401; mobile API with a bogus token 401; `/dashboard` redirects to `/login?next=%2Fdashboard`.
- Webhook replay: signature is bound to its timestamp, with a freshness window both ways (`webhook-signature.test.ts`).
- Static authZ: all 72 server actions in 11 `"use server"` files authenticate through the workspace helpers or ownership helpers (`requireOwnedClient`, `requireOwnedSubRecord`, `requireOwnedStaff`), scope by `businessId` and validate ids (Zod or `parseRecordId`). Every bare-`id` Prisma write runs on a row already loaded under the tenant scope. All 15 mobile routes use `requireStaffContext`.
- Licences (app, production): MIT/Apache/ISC/BSD majority; LGPL only in sharp's prebuilt libvips binaries (dynamically linked, standard for Next.js); FSL only in the Sentry CLI build tool; GSAP's free standard licence. Nothing blocks commercial use.
- Note: requests from this machine take 6–9 s because the TCP connect is slow to every site (WARP); server time is about 0.2 s. Phase 5 will measure from Vercel's own timings.

### Phase 3 rate-limit map

Store: Upstash (Vercel `KV_REST_API_*` set) as a sliding window across instances; per-instance fallback with oldest-key eviction and a 30 s circuit breaker. Client IP comes from `x-real-ip`, which Vercel overwrites, so it can't be forged.

| Scope | Key | Limit |
|---|---|---|
| Login | IP; account (after #151) | 12/min; 10/15 min |
| Sign-up | IP | 6/min |
| Resend confirmation, forgot password | IP (shared email quota) | 5/min |
| Confirm recovery / email link | IP | 10/min |
| Password change (re-auth) | user | 5/15 min |
| Every signed-in server action | user | 300/min (background calls 120/min) |
| WhatsApp pairing | clinic | 5/min |
| Global search, client typeahead | user | 30/10 s |
| Email verification poll | IP | per IP |
| WhatsApp sends | clinic, per send type | 30/min + 300/h (staff replies); 20/min + 200/h (automatic and follow-ups) |
| Reply acknowledgements | client; clinic | 3/h; per-clinic window |
| Mobile code redeem | IP; clinic | 8/min; 20/10 min |
| Mobile, any authenticated call | IP | 600/min |
| Mobile per device | device + action | 10–90/min (every route has one) |
| Reports AI refresh | clinic + period | cooldown |
| Cron, webhook | secret / HMAC | no limiter needed |

No unlimited endpoint found: the CSV statement is generated in the browser from data already on the page, and uploads go through server actions (per-user budget, 10 MB cap, image/PDF only at the bucket). The limiter's fallback, eviction and breaker are covered by unit tests (62 pass across `rate-limit`, `send-limits`, `mobile`). Live checks on localhost were done on 2026-10-12 for mobile redeem (8/min); the signed-in limits get a live check in Phase 4.

### Phase 7 (started early): error monitoring

- Sentry connector linked 2026-10-12 (org `vela-vr`, project `javascript-nextjs`, EU region). 3 unresolved issues in 30 days, 2 events each, 0 users, all from US datacenter locations at night: JAVASCRIPT-NEXTJS-8/9 (`null.replace` inside an injected inline script on `/`, not our code) and JAVASCRIPT-NEXTJS-B ("unexpected response from the server" on `/reports`, a server-action call from a tab left open across a deploy). Nothing since 2026-09-22. Not actionable.
- Vercel runtime errors over 7 days: 1 group, `refresh_token_not_found` in the proxy (2 events): an expired session cookie, after which the user is sent to login. Benign.
- `SUPABASE_SERVICE_ROLE_KEY` and `SENTRY_AUTH_TOKEN` added by the owner on 2026-10-12, so findings #1 and #2 close at the next deploy.

### Phase 5 (database part) and Phase 6/7 notes

- Database is small: largest table 1.9 MB, 1,960 appointments. Performance advisor: no missing indexes; 18 "unused" indexes, mostly foreign-key indexes on `clientId` that keep cascade deletes fast — kept on purpose.
- `pg_stat_statements`: app queries average under 50 ms. The heaviest by total time is the worker lease renewal (58k calls, 0.5 ms each), then the Reports snapshot read (28 ms average). No N+1 pattern shows in the call counts.
- Production cron runs in the last 24 h: reminders 78, follow-ups 80, storage-cleanup 84 log lines (hourly), analytics daily. Bot noise (`/wp-admin/install.php`, `/xmlrpc.php`) gets 404s.
- Launch runbook written: `docs/ops/launch-runbook.md` (deploy, rollback, DB-first changes, worker restart and re-pair, secrets, contacts to fill in).

### Phase 4 (public pages) and Phase 5 (web) notes

- All 14 public and account pages return 200; 11 internal links, none broken. No provider names in page text. `/checkout` takes no payment ("Online card checkout is being prepared…", contact to activate).
- At phone width (375 px), `/`, `/product`, `/pricing` and `/login` don't scroll sideways. Every image has alt text, every form field a label and every button a name; one `h1` per page; `lang="en"`. Framing is refused (`frame-ancestors 'none'`), confirmed from the browser.
- Production page loads in the browser: time to first byte about 60 ms once connected, full load 0.3–0.4 s; JS 250 KB (login) to 365 KB (home), compressed. The first request from this machine pays a 3.5 s connection setup (local network, see the Phase 2 note).
- Env var check after the 17:47 redeploy: the "SUPABASE_SERVICE_ROLE_KEY is not set" warning (previously on nearly every request) stopped; the 18:00 reminders run logged no warning. Sentry releases since then are marked as deployed (needs `SENTRY_AUTH_TOKEN`).

### Phase 2 cross-clinic (IDOR) test — 2026-10-13

Signed in as **Velucius** (Basic, workspace B) on localhost. Every attempt targeted **Vela Dent** (Pro, workspace A) records by their real ids, using reads or unchanged values only, so even a failed check could not have changed data. Nothing went out over WhatsApp.

| Attempt from Velucius | Result |
|---|---|
| Open A's client, client edit, staff, staff edit, appointment edit and conversation pages | No A data rendered (server sends the not-found page; see finding #14 for the dev skeleton) |
| `/api/search?q=…`, `/api/clients/search?q=…` for A's names | `[]` |
| `updateClientMedicationAction` on A's medication (with A's client id, then with B's client id) | "Patient not found in this clinic workspace." / "This record was not found in the patient file." |
| Same action with an object as the id (`{not:""}`) | "We couldn't save this record" (validation) |
| `addClientMedicationAction` onto A's client | Refused; 0 rows written (verified in SQL) |
| `markConversationReadAction` on A's conversation | "Conversation not found…"; A's unread count unchanged (4) |
| `hydrateConversationAction` on A's conversation | Threw P2025 (finding #13); no data returned |
| `markStaffThreadReadAction`, `generateMobileAccessCodeAction`, `revokeMobileAccessAction` on A's staff | "Staff member not found." |
| Controls on B's own client and staff | Succeed |
| Staff app: a Velucius staff phone (test device enrolled, then revoked) calls `GET /appointments/<A's appointment>` and `GET /threads/<A's thread>` | 404 "Appointment not found." / "Conversation not found." |
| Staff app: `POST /notifications/<A's notification>/read` | `{ok:false}`; the write is scoped by `businessId` and `staffMemberId` |
| Staff app: today's appointment list | Only Velucius data |
| Test device after revoke | `/me` returns 401 |

Basic-plan gating (Velucius): waiting list add/remove → "Waiting list is part of the Pro plan."; record no-show → "No-show tracking is part of the Pro plan."; `/reports` shows the "Reporting is part of Pro" upgrade page.

### Phase 4 (signed-in, Velucius) — 2026-10-13

- **Bookings:** a double-clicked save (two identical concurrent requests) creates one booking and refuses the second; an overlapping booking for the same staff member is refused; a booking on the closed day (Sunday) is refused, Saturday's short hours accepted; end-before-start and Feb 30 refused. A past date is accepted (back-dating a visit is allowed by design). Test bookings deleted; a second delete answers "not found".
- **Clients:** a double-clicked create saves one client (the second gets "We couldn't save the client record"). See #15 for the validation gaps. The UI's `type=email` field blocks a bad email before the server; a corrected edit saves and shows on the record.
- **Basic plan:** see the Phase 2 section (waiting list, no-show, Reports upgrade page).

### Phase 4 (signed-in, Vela Dent, Pro) and Phase 6 (worker unavailable) — 2026-10-13

Localhost has no worker settings, so these sends hit the "worker unavailable" path for real while nothing could reach a patient. The shared database was checked after each step.

- **Follow-up send, worker unavailable:** "Couldn't send this message. Try again."; the draft goes back to PENDING with `sentAt` null; WhatsApp status stays CONNECTED; no message rows. Two simultaneous sends: one tries, the other gets "This follow-up was already handled." A 9,000-character body: "The message is too long to send." A non-string body: "Write a message before sending."
- **Inbox reply, worker unavailable:** "We couldn't send the WhatsApp message."; no message row; status unchanged (a missing worker returns `channel_unconfigured`, which never marks the connection ERRORED). A blank reply is refused.
- **No-show:** marking a past completed visit as a no-show works; doing it twice is idempotent; undo restores "completed"; a future visit is refused ("…only after it has started"); risk scoring returns a level.
- **Waiting list:** add and remove work; a reversed time window and a 300-character service are refused; a second remove answers "already removed"; no slot-offer draft was left behind. See #16 for the duplicate add.
- **Reports (Pro):** renders KPIs and the chart. I skipped refreshing the AI insight on purpose, since localhost has no AI key and would replace the live AI snapshot with the rule-based one.
- **Production checks with the owner signed in:** `sb-*` auth cookies are now `Secure` (#150 live); tabs read "Dashboard | Vela" (#152 live); Vela Dent opening Velucius's client shows "We couldn't find that" (cross-clinic, the other direction).

### Phase 6 — WhatsApp worker restart (2026-10-12 23:00 UTC)

Owner redeployed the worker on Railway while a read-only monitor watched the lease every 3 s. The new worker took over at 23:00:04 (holder `439ee53c…` to `96fe6f7c…`) with no lapse, so the lease was held throughout. At the same second it posted a signed "connected" event that the app accepted (no "webhook rejected" warning) and Vela Dent's connection was refreshed (`lastSyncedAt` 23:00:04). It stayed CONNECTED, all 37 session keys were intact, no QR re-pair was needed, and `/health` returned `{"ok":true}`. The worker-down alert (#157, merged) would not have fired: the 5-minute grace covers a handover like this many times over.

### Phase 5 — Load test (2026-10-13 15:08 UTC, owner-approved)

Target: the Vercel preview of `main` + #157 (same database as production), signed in as Vela Dent, run from the Browser pane. 20 simulated users, each making one request per 0.7–1.3 s, for 120 s. Mix: 70% signed-in pages (dashboard, calendar, clients, a client record, inbox, reports, staff), 15% staff-app reads with a test device (`/me`, `/appointments`, `/threads`, `/notifications`), 15% `/pricing`. Nothing was sent; the test device was revoked afterwards (0 active devices on `qbm-staff-2`).

| Result | Value |
|---|---|
| Requests | 1,746 in 120 s (14.6 per second) |
| Success | 100% (all 200, no 429s, no 5xx) |
| Overall latency (client-observed) | p50 297 ms · p95 784 ms · p99 1.18 s · max 5.6 s (one staff-page request, a cold start) |
| Slowest pages | reports p50 587 / p95 1,089 ms; calendar p50 532 / p95 927 ms |
| Staff-app reads | p50 159–170 ms, p95 ≤ 267 ms |
| Database during load | 25 of 60 connections, 1 active, 0 idle-in-transaction (the transaction pooler absorbed it) |
| Preview errors in Vercel logs | none |

Single-request baseline before the load: pages 0.2–0.55 s, reports 0.55–1.0 s, so under load the median stayed close to baseline and only the tail grew.

**Ceilings (scaling note):** Vercel scales the web functions on its own; there's no load balancer to configure. The real limits are:
- **Database:** 60 connections on the current Supabase plan; the app goes through the transaction pooler with a small pool per function instance.
- **The single WhatsApp worker:** one socket per paired number, lease-based failover.
- **Upstash:** per-request limiter calls.

At the pilot's ~50 clinics, peak traffic is well below the 15 requests a second tested here.

### Phase 7 — alert wiring (2026-10-13)

Sentry created all four cron monitors on their first check-ins. The free plan keeps only one active: `cron-reminders` (healthy, last check-in 15:00 UTC; it also carries the worker-down check from #157). Storage cleanup, analytics and follow-ups were auto-disabled for plan quota. A new email alert, "Background job failed or missed" (id 1368370), is connected to all four, so it already covers the reminders job and will cover the others if they're enabled (pay-as-you-go, about $0.78 per monitor per month). Alerts in place: "Vela app is down" (login uptime, every 5 min), "Background job failed or missed", and the existing "high priority issues" error alert.

### Phase 8 — Vela Staff app on a real Android phone (2026-10-13)

Android only (no Apple developer account). EAS `preview` build from vela-mobile-app `master` @ `7a608d5`, pointed at production.

- **Install and enrolment:** the build installs from the EAS link; enrolment with a staff access code works.
- **Unlock:** fingerprint unlock works; leaving the app idle locks it again; swiping it away from recents and reopening asks for the fingerprint and resumes normally.
- **Badges (#17):** a staff message sent from the web Staff page shows on the phone's Inbox tab within about 30 s; a reply from the phone shows as a count on the web Staff item.
- **Offline:** airplane mode shows a clear no-connection state, no crash; pull-to-refresh recovers once back online.
- **Android back:** back from a conversation returns one screen instead of closing the app.
- **Sign-out:** signing out on the phone revokes the device; the web's Mobile access no longer lists it as active.
- **Not tested:** push delivery (waits for the owner's Firebase setup) and iPhone (no Apple account). Store listing items (icons, permission text, privacy labels) are for the store submission, not the pilot's sideloaded build.

### Phase 9 — close-out (2026-10-13)

- **Regression on `main` @ `d857274`:** `tsc` clean, eslint clean, Vitest 1,719/1,719. The first run after a branch switch timed out 4 cron route tests at 30 s on a cold transform cache (they import the Sentry SDK through `cron-monitor` now); the immediate rerun and the cron files alone pass, and CI has been green on every PR. Watch for it if CI ever runs cold.
- **Production probes:** `/`, `/login`, `/pricing` 200; `/dashboard` redirects to login; `/api/cron/reminders` without the secret gives 401.
- **Database health:** 0 pending storage cleanups, 0 failed reminders in 7 days, 0 abandoned reply intents, worker lease renewing (about 27 s left), 4 active staff devices (none from the sweep). 23 past visits were still PENDING; the 22 at Vela Dent were marked completed on 2026-10-13 through `saveAppointmentAction` (owner's request; times unchanged), leaving 1 Velucius test visit.

## Go / no-go

**Go for the pilot**, with these consciously accepted or deferred:

| Item | Status | Why it's acceptable for the pilot |
|---|---|---|
| No restorable backups (Supabase Free) | Accepted by owner (#9) | Pilot data, small; revisit before onboarding real clinics' data |
| Leaked-password check off | Plan-gated (#4) | Login is limited per IP and per account (#151) |
| CSP `unsafe-inline` | Deferred (#6) | Needs per-request nonces; no user HTML is rendered |
| 400-day sessions, no idle sign-out | Deferred (#5) | Planned auto-logoff safeguard |
| Only the reminders cron monitor is active | Owner declined paid Sentry | Reminders is the patient-facing job and carries the worker check |
| Staff app push notifications and iPhone | Deferred | Android passed every device check (Phase 8); push waits for the owner's Firebase setup, iPhone for an Apple developer account. Badges and polling cover new messages meanwhile |
| Duplicate waiting-list add from two tabs | Accepted (#16) | Harmless; the UI prevents double-clicks |

Fix PRs merged during the sweep: #150, #151, #152, #153, #154, #155, #157, #158, and vela-mobile-app #25.

**Phase 6 follow-up (2026-10-13):** at 23:02:28 UTC, two minutes after the restart, Vela Dent's link was logged out (401) and the worker wiped its session (0 keys) and reported "disconnected". **Cause: the owner unlinked the device from the phone on purpose** (it's the owner's personal WhatsApp), not the restart. The logout path worked as designed: it cleared the creds so a stale session can't loop, and set the status to DISCONNECTED with reminders skipped. On 2026-10-13 the worker was redeployed again with `DATABASE_SSL_CA` set: the new instance took the lease with strict TLS verification. Vela Dent stays unpaired until the owner links a dedicated clinic number. The restart path was verified while connected (above).
