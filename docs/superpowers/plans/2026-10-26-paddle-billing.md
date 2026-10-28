# Paddle Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clinics start a card-up-front free trial through Paddle, are billed automatically, manage/cancel through Paddle's portal, and drop to a read-only workspace (kept 90 days) when they stop paying; the owner can keep chosen clinics free.

**Architecture:** Paddle is the source of truth for money. A signed webhook (plus an hourly reconcile against Paddle's API) writes a subscription snapshot onto `Business`. One pure function, `workspaceAccess(business, now)`, turns that snapshot into `full | needs_plan | locked`; every write path (server actions, mobile API writes, the messaging seam, cron senders, reply intents) consults it through a handful of shared helpers. Paddle.js (overlay checkout + PricePreview) runs only on `/checkout` and the pricing page; everything else talks to Paddle's REST API with raw `fetch` (no SDK, CLAUDE.md "keep dependencies lean").

**Tech Stack:** Next.js 16 App Router, Prisma 6 (`db push`), Vitest, Paddle Billing v1 API + Paddle.js v2.

**Spec:** `docs/superpowers/specs/2026-10-26-paddle-billing-design.md`

## Global Constraints

- Prices (tax-inclusive, `tax_mode: "internal"`): Basic $39/mo, $429/yr; Pro $79/mo, $869/yr. EUR overrides €39/€79/€429/€869; other currencies = Paddle automatic conversion.
- Trials: 14 days on every plan and interval, card required; one trial per workspace (`trialUsedAt`).
- Plan/interval changes: immediate, `proration_billing_mode: "prorated_immediately"`.
- Lock = read-only; data kept 90 days from `lockedAt`; deletion only by the owner from `/owner`.
- Locked/needs-plan workspaces send **nothing** to patients.
- Env: `PADDLE_ENV` (`sandbox` | `production`), `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_ENV`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_PRICE_IDS` (JSON, see Task 4), `VELA_ADMIN_EMAILS` (comma list). Server secrets never reach the client or logs.
- Customer-facing copy never names Paddle internals or raw errors; no em-dashes in visible copy; sentence case.
- No patient data to Paddle: only the business name, owner email, `custom_data.businessId`.
- Schema: `npm run db:push` only, never `--accept-data-loss`. New columns default so existing rows keep today's behaviour (no backfill writes).
- One small PR per task group (A–H below), merged in order, each only after the owner's explicit go-ahead.
- Gates per PR: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`.

## Review Focus

1. **Out-of-order / duplicate webhooks** — an older `subscription.updated` arriving after `subscription.canceled` must not resurrect access, and a replay must be a no-op (`billingSyncedAt` ordering). Tested in Task 5.
2. **A paying clinic locked by a missed webhook** — the hourly reconcile re-reads any subscription whose period has ended without a fresh event. Tested in Task 6.
3. **A write path that forgets the lock** — every `actions.ts` export, mobile POST, `sendMessage`, cron sender and reply intent; the audit table in Task 2 lists each with its decision. Tested in Tasks 1–3.
4. **Existing clinics locking on deploy** — `billingMode` defaults to `COMPLIMENTARY`; only onboarding (Task 8) writes `SUBSCRIPTION`. Tested in Task 1.
5. **Second trial** — a workspace with `trialUsedAt` gets the no-trial price at checkout. Tested in Task 7.

---

## PR A — Access model and lock enforcement (no Paddle yet)

### Task 1: Billing fields and the access rules

**Files:**
- Modify: `prisma/schema.prisma` (enums `BillingMode { COMPLIMENTARY SUBSCRIPTION }`, `SubscriptionStatus { NONE TRIALING ACTIVE PAST_DUE PAUSED CANCELED }`, `BillingInterval { MONTH YEAR }`; `Business` fields `billingMode @default(COMPLIMENTARY)`, `subscriptionStatus @default(NONE)`, `billingInterval?`, `paddleCustomerId?`, `paddleSubscriptionId? @unique`, `currentPeriodEndsAt?`, `cancelAt?`, `trialUsedAt?`, `lockedAt?`, `billingSyncedAt?`)
- Create: `src/lib/billing-access.ts`, `src/lib/billing-access.test.ts`

**Interfaces — Produces:**
- `type WorkspaceAccess = { kind: "full"; notice: BillingNotice | null } | { kind: "needs_plan" } | { kind: "locked"; keptUntil: Date | null }`
- `type BillingNotice = { kind: "past_due" } | { kind: "ending"; endsAt: Date } | { kind: "trial"; endsAt: Date }`
- `workspaceAccess(b: BillingSnapshot, now?: Date): WorkspaceAccess`
- `canUseWorkspace(b: BillingSnapshot, now?: Date): boolean`
- `workspaceUsableWhere(): Prisma.BusinessWhereInput`
- `WORKSPACE_LOCKED_ERROR: string`, `RETENTION_DAYS = 90`, `retentionEndsAt(lockedAt: Date): Date`

Rules: `COMPLIMENTARY` → full. `SUBSCRIPTION` + `TRIALING|ACTIVE|PAST_DUE` → full (notice: past_due; `cancelAt` → ending; trialing → trial). `NONE` → needs_plan. `PAUSED|CANCELED` → locked, `keptUntil = lockedAt + 90d`.

- [ ] Write `billing-access.test.ts` covering every row above, plus "a default `Business` row (COMPLIMENTARY/NONE) is full" (Review Focus 4) and `workspaceUsableWhere` matching the same statuses.
- [ ] Run `npx vitest run src/lib/billing-access.test.ts` — FAIL (module missing).
- [ ] Implement; run — PASS. Add the schema; `npx prisma generate`; `npx tsc --noEmit`.

### Task 2: Server-side write gate

**Files:** `src/lib/business.ts`, every `src/app/(workspace)/**/actions.ts`, `src/app/(workspace)/settings/actions.ts`, `src/app/(workspace)/reports/actions.ts`, `src/lib/mobile/guard.ts` + the mobile write routes, `src/lib/messaging/index.ts` (+ `types.ts` reason `"workspace_locked"`), `src/lib/messaging/inbound.ts`, `src/lib/automations-data.ts` (`automationEnabledWhere`), `src/lib/reminders.ts`, `src/app/api/cron/analytics/route.ts`, tests beside each.

**Interfaces — Produces:** `getAuthedBusiness(msg, { budget, access?: "write" | "read" })` returns `{ error: WORKSPACE_LOCKED_ERROR, locked: true }` for `access: "write"` (the default) when `!canUseWorkspace`; `budget: "background"` implies read. `mobileWriteBlocked(ctx): NextResponse | null` (403 + generic message).

- [ ] Audit every exported action and mobile POST; record each as write (gated) or read (`access: "read"`) in the PR description. Reads: month loading, search, notification refresh, mark-read. Billing actions stay ungated.
- [ ] Tests: `getAuthedBusiness` refuses a locked workspace and allows `access: "read"`; `sendMessage` returns `workspace_locked` without calling the adapter; `automationEnabledWhere` includes the usable clause; reply intents are marked handled without effect while locked; mobile write returns 403.
- [ ] Implement; full suite green.

### Task 3: Lock and plan states in the workspace UI

**Files:** `src/app/(workspace)/layout.tsx`, `src/components/layout/app-shell.tsx`, create `src/components/billing/billing-banner.tsx`, `src/components/billing/workspace-locked-state.tsx`; the create/edit pages (`calendar/new`, `calendar/[id]/edit`, `clients/new`, `clients/[id]/edit`, `staff/new`, `staff/[id]/edit`) and `reports/page.tsx`.

- `needs_plan` → `redirect("/checkout")` from the layout.
- `locked` → one calm amber banner above every page ("This workspace is read-only. Your plan ended on …; your records are kept until …" + **Renew plan** → Settings › Billing). Create/edit pages and Reports render `WorkspaceLockedState` (same copy, one action) instead of the form.
- `full` with a notice → quiet banner for `past_due` ("Your last payment didn't go through. Update your card to keep using Vela.") and `ending`.
- [ ] Unit-test the banner copy builder (dates in the clinic's zone); render check in build.

### Task 4 (part of PR A, separate commit): Owner page

**Files:** create `src/app/owner/page.tsx`, `src/app/owner/actions.ts`, `src/lib/owner-admin.ts` (+ test), `src/proxy.ts` (protect `/owner`).

**Interfaces — Produces:** `isOwnerAdmin(email: string | undefined): boolean` (reads `VELA_ADMIN_EMAILS`); actions `setBillingModeAction({ businessId, mode, plan? })`, `deleteExpiredWorkspaceAction({ businessId, confirmName })`.

- Non-admins get `notFound()`. Lists workspaces: name, owner email, plan, billing mode, subscription status, trial/period end, locked-since, "due for deletion" when `now > lockedAt + 90d`.
- Turning free off sets `SUBSCRIPTION`, `lockedAt = now` (starts the 90-day clock if they never pay) — the clinic lands on `/checkout`.
- Delete only when due, only with the typed workspace name; reuses the existing account-deletion path (Supabase user + business cascade + storage cleanup outbox). If no such path exists, ship the listing only and flag deletion.
- [ ] Tests for `isOwnerAdmin` and the due-for-deletion predicate.

## PR B — Paddle sync

### Task 5: Paddle config, client and webhook

**Files:** create `src/lib/billing/paddle-config.ts`, `src/lib/billing/paddle-api.ts`, `src/lib/billing/paddle-webhook.ts` (+ tests), `src/lib/billing/subscription-sync.ts` (+ tests), `src/app/api/webhooks/paddle/route.ts`; `.env.example`; `src/proxy.ts` if needed.

**Interfaces — Produces:**
- `paddleConfig(): { env, apiBase, apiKey, webhookSecret, prices: PriceTable } | null` (null when unconfigured → billing UI shows "coming soon", nothing crashes).
- `PriceTable = Record<"BASIC"|"PRO", Record<"MONTH"|"YEAR", { trial: string; noTrial: string }>>` parsed from `PADDLE_PRICE_IDS`.
- `verifyPaddleSignature(rawBody, header, secret, now): boolean` — `ts=…;h1=…`, HMAC-SHA256 hex of `${ts}:${rawBody}`, constant-time compare, reject ts older than 5 min.
- `applySubscriptionSnapshot(sub: PaddleSubscription, occurredAt: Date): Promise<"applied"|"stale"|"unmatched">` — finds the business by `paddleSubscriptionId`, else by `custom_data.businessId` (only if that business has no other live subscription); ignores events older than `billingSyncedAt`; maps price id → plan/interval via `PriceTable`; sets status, period end, `cancelAt` (scheduled cancel), `trialEndsAt`, `trialUsedAt` (first trialing), `lockedAt` (set on entering PAUSED/CANCELED, cleared on TRIALING/ACTIVE/PAST_DUE), `planStatus` mirror.
- `paddleApi.getSubscription(id)`, `paddleApi.updateSubscriptionItems(id, priceId)`, `paddleApi.createPortalSession(customerId, subscriptionIds)`.

- [ ] Tests: signature valid/invalid/stale/tampered; snapshot mapping for each status; out-of-order event is `stale`; replay is idempotent; unknown price id → `unmatched` and logged by id only.
- [ ] Route: raw body, verify, handle `subscription.*` events, 200 on stale/unmatched (so Paddle stops retrying), 401 on bad signature, 500 on DB error (Paddle retries).

### Task 6: Hourly reconcile cron

**Files:** create `src/app/api/cron/billing/route.ts` (+ test of the selector), `vercel.json` (`"10 * * * *"`).

- Re-fetches subscriptions with `currentPeriodEndsAt < now - 1h` or `cancelAt < now` and no event since, applies them through `applySubscriptionSnapshot`. Same `isAuthorized()` guard and lock pattern as the other crons.

### Task 6b: Sandbox setup script

**Files:** create `scripts/paddle-setup.mjs` (untracked-style ops script, committed so it can be re-run for live).

- Given `PADDLE_API_KEY` + `PADDLE_ENV`, idempotently creates the two products, the eight prices (trial/no-trial × plan × interval, tax-inclusive, EUR overrides for EU countries), and the webhook destination for `subscription.*` events at `<APP_URL>/api/webhooks/paddle`; prints the `PADDLE_PRICE_IDS` JSON and the webhook secret for the owner to paste into Vercel.

## PR C — Checkout

### Task 7: Checkout page with Paddle overlay

**Files:** `next.config.ts` (CSP: `script-src https://cdn.paddle.com`, `frame-src https://buy.paddle.com https://sandbox-buy.paddle.com`, `connect-src https://*.paddle.com`), `src/app/checkout/page.tsx`, create `src/components/billing/paddle-checkout.tsx` (client), `src/lib/billing/checkout.ts` (+ test), `src/app/checkout/success/page.tsx`.

**Interfaces — Produces:** `checkoutPriceId(table, plan, interval, trialUsedAt): string` (no-trial price when the trial was used — Review Focus 5); `usePaddle()` client hook (loads Paddle.js once, `Environment.set`, `Initialize`).

- Monthly/yearly switch, both plans, localized prices from `Paddle.PricePreview` (falls back to USD list prices), primary button "Start 14-day free trial" (or "Subscribe" when the trial is used), the first-charge line ("Free until 9 November, then €39 a month. Cancel any time before."), opens overlay with `customer.email`, `customData.businessId`, `successUrl=/checkout/success`.
- Success page polls the business (server action, read) until `subscriptionStatus` is TRIALING/ACTIVE, then goes to `/dashboard`; after 60 s shows "We're still setting up your plan" with a refresh.
- Signed-out visitors keep today's "create an account" path.

### Task 8: New clinics must choose a plan

**Files:** `src/app/onboarding/actions.ts` (new businesses `billingMode: "SUBSCRIPTION"`, `subscriptionStatus: "NONE"`, `lockedAt: now`), `src/app/onboarding/complete/page.tsx` (first step = choose a plan), test.

## PR D — Settings › Billing

### Task 9: Billing section

**Files:** `src/lib/settings.ts`, `src/components/settings/settings-workspace.tsx` (billing section), `src/app/(workspace)/settings/billing-actions.ts` (+ test).

- Shows plan, interval, status in words, trial end / next charge / ends on, the past-due notice; **Manage plan** (portal session URL, opens in a new tab) for card, invoices, cancel; **Change plan** (Basic ↔ Pro, monthly ↔ yearly) with a confirm dialog stating the prorated effect; free accounts see "Free account" and no buttons; locked/needs-plan see **Choose a plan** → `/checkout`.
- Actions are ungated by the lock (they are how a clinic gets unlocked), owner-of-business only, rate limited.

## PR E — Public pricing

### Task 10: Pricing, plan strip, compare table, FAQ

**Files:** `src/lib/public-plans.ts`, `src/components/marketing/shared/plan-strip.tsx`, `src/components/marketing/pricing/*`, create `src/components/marketing/shared/localized-price.tsx` (client, PricePreview with fallback).

- Monthly/yearly toggle, "one month free" on yearly, localized price, "14-day free trial" on both plans, CTAs "Start free trial" → `/sign-up` (signed out) or `/checkout?plan=…&interval=…`. FAQ answers: trial and card, cancel, refunds (14 days), currencies and VAT included, what happens if you stop paying (read-only, 90 days). Plan finder and compare table keep their structure.

## PR F — Legal pages

### Task 11: Terms, Privacy, Refund

**Files:** `src/lib/legal-content.ts`, `legalLastUpdated`.

- Needs the owner's **legal entity name and registered address** (ask before starting this task). Content per the spec's "Legal pages" section; Paddle MoR sentence verbatim; refund via paddle.net.

## PR G — Pro trial offer for Basic clinics

### Task 12: Offer, accept, keep or return

**Files:** schema (`subscribedPlan BusinessPlan?`, `proTrialOfferedAt?`, `proTrialEndsAt?`), `src/lib/billing/subscription-sync.ts` (effective `plan` = PRO while `proTrialEndsAt > now`, else the subscribed plan), owner action `offerProTrialAction`, settings billing actions `acceptProTrialAction` / `keepProAction`, billing cron reverts expired trials, tests.

## PR H — Docs

### Task 13: Docs

**Files:** `AGENTS.md` (Plans, Billing, and Feature Gating), `CLAUDE.md` (Billing integration, env vars, crons, "Not built yet"), `PROJECT_STATUS.md`, `ROADMAP.md` Step 4. Fold each doc change into the PR that makes it true where practical; this task catches the rest.

## Owner checkpoint (end)

Before any push: the owner provides a **Paddle sandbox** API key + client-side token (sandbox-vendors.paddle.com), turns on automatic currency conversion in the sandbox dashboard, and the legal entity details (Task 11). Then: `db push`, run `scripts/paddle-setup.mjs` against sandbox, set preview env vars, push PR A, and test end to end on its preview: sign up → trial → webhook → dashboard; cancel → locked at period end (sandbox lets us shorten via API); failed card (Paddle test card) → past-due banner; free toggle from `/owner`.
