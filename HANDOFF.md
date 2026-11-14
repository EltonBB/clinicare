# HANDOFF: read this first, on either PC

**Last written:** 2026-11-14, by Claude on the new PC (`C:\dev\vela`), at `main` @ `10dc2f4`.

This file carries the work between the two PCs. It is the single place for "where are we, what happened, what's next". It lives in the repo so both PCs always have the same copy after `git pull`.

## How this file works (do this every time you switch PCs)

1. **Starting on a PC:** `git pull` both repos (`clinicare`, `vela-mobile-app`), then read this file top to bottom before anything else. Trust it over older notes (the OneDrive `HANDOFF.md`, `NEXT-SESSION.md`, local memory), but check its claims against the code and GitHub.
2. **Stopping on a PC:** rewrite this file, don't append to it.
   - Sections 1 to 3 describe *now*: replace them.
   - Section 4 (audit plan): tick off or remove what's done, add new findings.
   - Keep sections 5 to 7 unless something changed.
   - Update the "Last written" line.
3. Ship it like any change: a small `docs:` PR, merged once Codex is clean. Never push to `main` directly.
4. **The repo is public.** Never put secrets, emails, account or project IDs, or patient data in this file. Those stay in each PC's local `.env.local` and Claude memory.

---

## 1. Where things stand (2026-11-14)

- **`main` @ `10dc2f4`:** CI green (`verify`, `verify-postgres`), production deployed on Vercel and Railway.
- **Billing batch** (Paddle upgrade work), in order:
  - #232 (only Basic has a trial; Pro is paid from day one): merged earlier.
  - #233 (Upgrade → checkout → Pay): **merged** 2026-11-14 (`8ede854`) after 3 more Codex rounds (section 2).
  - #234 (a clinic the owner made free can pay and becomes a paying clinic): **merged** 2026-11-14 (`10dc2f4`).
  - **PR C** (automatic Pro trial): **not started.** Next task (section 3).
  - **Post-batch QA** of #232 to C: after PR C merges.
- **Open PRs:** this handoff PR only. **Mobile repo:** `master` clean, no open PRs.
- **Leftover branches**, both merged, safe to delete when the owner says: `feat/upgrade-checkout-pay`, `feat/free-clinic-upgrade`.
- **Gates on `main` (2026-11-14):** `tsc`, lint, 7292/7292 tests, build, `npm audit --omit=dev` 0 vulnerabilities (app and worker). Mobile: `tsc`, lint, 249/249 tests.

## 2. What happened last session (new PC, 2026-11-10 → 11-14)

- **New PC set up.** Repos in `C:\dev\vela` (outside OneDrive), `core.autocrlf=false` in both repos, commits as EltonBB, the current `clinicare/.env.local` copied over, build and dev server verified. The Expo Claude plugin is installed as `expo@anthropic-plugin-directory`.
- **#233 Codex rounds, all fixed and merged:**
  1. `a0835dc`: Settings plan change, cancel, resume and the upgrade share **one per-subscription lock** (`withSubscriptionLock` in `src/app/(workspace)/settings/billing-actions.ts`, `pg_try_advisory_xact_lock` namespace 726343). Under it, the plan change re-reads Paddle and refuses if Paddle shows another plan, status or a scheduled cancel. It saves Paddle's state so a refresh shows it.
  2. `2c83133`: **Pay is bound to the shown quote.** Checkout sends the amounts on screen (`approved`: currency, due today, recurring, in minor units). Under the lock the action asks Paddle again (`upgradeAmounts` in `src/lib/billing-upgrade.ts`) and charges only on an exact match. Otherwise: "The amount due has changed. Check the new amount, then pay."
  3. `aa9a40c`: after a declined trial upgrade, the rollback restores the **exact price Paddle had**, read under the lock, not one rebuilt from the saved interval.
- **#234 fix, merged:** `bd4ef05`. The free-upgrade stamp's age (max 24h) is measured to **when Paddle created the subscription** (`created_at`, falling back to the event time), not to processing time. A late webhook or the reconcile cron no longer cancels a real payment.
- **Owner decisions this session:**
  - Merge a PR in this batch once Codex is clean (Codex 👍, `has_unresolved_findings: false`, 0 open threads).
  - The **Supabase migration plan** (section 5) waits until the billing batch and its QA are done. Raise it then, unprompted.

## 3. Next steps, in order

### 3.1 PR C: the automatic Pro trial (spec, owner decisions 2026-11-09)

1. **Who gets it:** a clinic that has **paid for Basic for 30 days** gets one free 14-day Pro trial, once per clinic.
   - "Paid for 30 days" = Basic subscription `ACTIVE` with its first paid charge at least 30 days ago. For most clinics that's `trialUsedAt + 14 days`.
   - Decide whether a new field (e.g. `basicPaidSince`) is needed. **Any schema change (`npm run db:push`) needs the owner's explicit go-ahead first**, separate from merge approval.
   - Today the offer is a manual owner action (`proTrialOfferedAt`, set from `/owner`). Make it automatic and **remove the "Offer Pro trial" button** from `/owner`.
2. **Wording:** "14-day free trial of Pro", in Settings › Billing and, where it fits, beside the Upgrade buttons.
3. **During the trial** the clinic keeps paying **Basic**. This already works: `lib/pro-trial.ts` sets `plan = PRO` while Paddle bills Basic.
4. **When the trial ends:** a popup, "Upgrade to Pro or stay on Basic?".
   - Upgrade → `/checkout?plan=pro` (`upgradeToProAction` ends the Pro trial when they pay).
   - Stay → `endProTrialAction`.
   - No answer → back to Basic: the hourly `/api/cron/billing` already ends expired Pro trials.
5. Update `AGENTS.md` (Plans, Billing, and Feature Gating) and `CLAUDE.md` (External integrations › Billing) in the same PR. Also describe there the lock, quote binding and stamp-age rules from section 2 (audit item A5).

### 3.2 Post-batch QA of the billing batch (after PR C merges)

Per CLAUDE.md step 9:
- Re-read the combined diff (#232 to C) and run the gates on `main`. Confirm the production deploy is green.
- In the browser, with the owner's test clinic, on the Paddle sandbox:
  - upgrade from paying Basic, and from Basic's trial;
  - a declined card (`4000 0000 0000 0002`) changes nothing;
  - two tabs at once (upgrade + Settings period change) → one waits;
  - leave checkout open, change the amount, then Pay → "amount has changed";
  - the free clinic → paying clinic switch (#234) end to end. This only became testable now: Paddle sends sandbox webhooks to production;
  - PR C's trial offer and its end popup;
  - both languages, phone width.
- Add a "Last Completed Task" entry for the batch to `PROJECT_STATUS.md`.
- Report "clean", or fix through small PRs.

### 3.3 Then

The audit fixes in section 4 (small PRs, review loop), then the Supabase migration discussion (section 5).

## 4. Audit 2026-11-14: findings and plan

What was checked:
- gates on `main` and on the mobile app;
- dependency audits (app, worker, mobile);
- outdated packages;
- Vercel runtime errors (last 7 days) and production deploys;
- Supabase security and performance advisors;
- a code read of the billing batch.

Nothing blocking was found. Fix in this order:

| # | What | Why it matters | Fix | Size |
|---|---|---|---|---|
| A1 | Free-upgrade stamp expires 24h after the checkout page **loads** | An owner who leaves checkout open over a day, then pays, is charged and then refused (the subscription is cancelled) | Fetch a fresh stamp from a server action right before Paddle's checkout opens; keep the 24h rule | Small |
| A2 | Settings plan change (e.g. Pro monthly → yearly) charges a prorated amount **without showing it** | The upgrade checkout always shows the amount first; Settings doesn't | **Owner decides.** If yes: preview with `previewPaddleSubscriptionChange`, confirm step, bind the charge to the shown amount like #233 | Medium |
| A3 | Refusing a webhook's subscription logs "Couldn't cancel a refused Paddle subscription" on Paddle's **409 conflict** | Seen in prod on 2026-11-09: two events for one checkout cancelled it at the same moment. Harmless (the subscription is cancelled), but it alerts as an error | In `refuseSubscription` (`src/lib/paddle/subscription-sync.ts`), on 409 re-read the subscription; if Paddle says cancelled, return quietly | Small |
| A4 | Subscription lock lasts 60s, but a declined trial upgrade can make ~8 Paddle calls at up to 10s each | If Paddle were very slow, the lock could be released mid-change. Existed before #233; rare | Pass a deadline into the lock's work, or lower `PADDLE_TIMEOUT_MS` for the calls made under the lock (e.g. 6s) and keep the total under 60s | Small |
| A5 | `CLAUDE.md`/`AGENTS.md` don't yet describe the lock, quote binding and stamp-age rules | The next agent could undo them in a review | Fold into PR C's doc update (3.1 step 5) | Small |
| A6 | Mobile: 5 Expo patch updates waiting (`expo`, `expo-linking`, `expo-router`, `expo-splash-screen`, `jest-expo`); `npm audit` reports findings, all inside Expo's own build tools | Keep in step with SDK 56 patches | `npx expo install --fix`, run gates, one small PR in `vela-mobile-app` | Small |
| A7 | Major upgrades available: Prisma 7, TypeScript 7, ESLint 10, Vitest 5, framer-motion 14, lucide-react 1, `@sentry/nextjs` 11 | None urgent; each can break things | One major per PR, after launch-critical work. Prisma last (it pairs with moving to `prisma migrate`) | Large, later |
| A8 | Supabase "RLS enabled, no policy" on every table | **Intended:** the browser's API is locked out; all access is server-side through Prisma (CLAUDE.md Security model) | None | none |
| A9 | 11 unused indexes (Supabase advisor) | Pilot traffic is low, so "unused" may just mean "not yet" | Re-check after real clinics use it; don't drop now | none |
| A10 | `AuthApiError: refresh_token_not_found` in `/middleware` (2 events in 5 months) | An expired session; thrown and logged by the Supabase library | Watch only | none |

**Owner-only items** (already in `PROJECT_STATUS.md` → Known Issues; still open):
- Leaked-password protection in Supabase Auth (needs the paid plan).
- Make the GitHub repo private.
- Move Upstash Redis to `eu-central-1`.
- Relink WhatsApp.
- A lawyer's read of the legal pages.
- Switch Paddle to live keys, last.
- Firebase/APNs for staff-app push.
- Move from `db push` to committed `prisma migrate` migrations before real patient data.

## 5. Agreed for after the billing batch: the Supabase migration plan

The owner wants full long-term control. Decided 2026-11-11, in this order, each as its own small PRs:

1. **Sign-in → Better Auth** (open source, users in our own Postgres via Prisma, emails through Resend, EN + SQ).
   - It replaces about 30 `supabase.auth.*` calls in `lib/auth.ts`, `lib/business.ts`, `lib/auth-metadata.ts`, the `(auth)` pages and actions, `app/auth/confirm`, onboarding, `utils/supabase/*` and `proxy.ts`, plus the `auth.users` delete trigger (`scripts/setup-auth-delete-sync.mjs`).
   - Map old user IDs to the new ones. Check whether Supabase's bcrypt password hashes can be verified, so owners keep their passwords.
   - Do it while there are few clinics.
2. **Clinic files → Cloudflare R2** (EU, private, signed links); only `lib/media-storage*.ts` changes. Copy the existing files over.
3. **Nightly encrypted `pg_dump` → R2** from a scheduled GitHub Action, with ~30-day retention. Test restores. This step can be done on its own, even on Supabase.
4. **Database:** no rush; once 1 and 2 are done Supabase is just the Postgres host. A self-managed VPS was advised against.

Also needed: a data processing agreement with each new provider, EU regions, monitoring, a staging rehearsal. ROADMAP.md (which says "stay on Supabase") and CLAUDE.md change with it. **Staff app sign-in (access codes) is not affected.**

## 6. Working rules (the owner's; the full text is in CLAUDE.md)

- **Review loop:**
  1. Small single-purpose PRs.
  2. Implement carefully.
  3. Gates: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`.
  4. One review sized to the risk (money and security: `/code-review` low or medium).
  5. `/ponytail-review` once.
  6. A last review pass.
  7. PR → Codex.
- **Codex:**
  - It reviews automatically on every push. Clean = 👍 on the PR and `has_unresolved_findings: false`.
  - Fix the whole class of a finding. Reply "Fixed in `<sha>`." to each thread and resolve **only those threads, by ID**.
- **Never push to `main`.** Commit and push when the work is asked for. Merge only with the owner's OK; the billing batch is pre-approved once Codex is clean.
- **Schema changes** need their own explicit go-ahead.
- **Customer-facing copy** never names providers. The product is "Vela".
- **Talk to the owner** in plain words, like a business partner.

## 7. Paddle and QA facts worth keeping

- **Production runs on the Paddle sandbox account** until the owner says go live, and **Paddle sends sandbox webhooks to production**. New webhook behaviour can only be tested end to end after it's deployed.
- **Sandbox cards** (any name, future expiry, CVC `100`):
  - `4242 4242 4242 4242` works;
  - `4000 0000 0000 0002` always declines;
  - `4000 0027 6000 3184`: the first charge works, later ones decline (3DS page: Approve).
- **Paddle behaviour:**
  - A trialing subscription only accepts `do_not_bill` changes; `POST /subscriptions/{id}/activate` ends the trial and charges.
  - In a change preview, `recurring_transaction_details.totals.total` is the price, and the immediate `grand_total` is "due today".
- **The owner's test clinic** (a free Basic clinic, sandbox subscriptions cancelled) is the one for testing #234 and PR C. Its login stays with the owner.
- **Idle sign-out** after 30 minutes in the workspace.
- **Localhost sign-up confirmation links** fail by design (not in Supabase's redirect URLs).
- **Each PC:**
  - `node check-env.mjs` in `C:\dev\vela` checks `clinicare/.env.local` (names only).
  - `.claude/launch.json` there has the dev servers.
  - After a fresh clone, run `npm ci` in `services/whatsapp-worker` too.
  - `jq` is not installed on the new PC; use `gh --jq` or `node` instead.
