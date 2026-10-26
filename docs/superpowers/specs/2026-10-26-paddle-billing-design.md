# Paddle billing — design

Date: 2026-10-26. Owner-approved in chat the same day. Implements ROADMAP Step 4's
"Billing (Paddle) behind `/checkout`: checkout session, webhooks, plan activation".

## Why

Vela is ready to charge clinics. Today `/checkout` only describes plans and its pay
button is locked; plan state on `Business` (`plan`, `planStatus`, `trialEndsAt`) is set
by hand. This work makes a clinic able to start a trial with a card, be charged
automatically, manage or cancel its subscription, and lose the ability to work (but
not its data) when it stops paying — with no manual step from the owner, except for the
pilot clinics he chooses to keep free.

## What the clinic experiences

### Plans and prices (owner decisions)

| Plan  | Monthly | Yearly (one month free) | Free trial |
|-------|---------|-------------------------|------------|
| Basic | $39     | $429                    | 14 days    |
| Pro   | $79     | $869                    | 14 days    |

(Pro's trial was 7 days in the first draft; the owner moved it to 14 on 2026-10-26 after
the research: Pro's value needs a couple of weeks of real bookings to show, and Paddle
only sends its "your trial is ending" reminder for trials longer than 7 days.)

- Prices are shown and charged **in the visitor's local currency, picked by Paddle from
  their location**. Euro prices are set by hand to the same numbers (€39 / €79 / €429 /
  €869); every other currency uses Paddle's automatic conversion of the USD price
  (*my call*, owner did not object).
- **Prices include VAT** (owner decision): the clinic pays exactly the listed price in
  every country, and Paddle, as merchant of record, takes the tax out of it. The Paddle
  prices are configured tax-inclusive.
- Yearly plans get the same trials as monthly (*my call*).
- The pricing page, the checkout page, the plan strip on the home page and the
  in-app Billing section must all show the same localized numbers (AGENTS.md: plan copy
  stays consistent everywhere). The monthly/yearly choice is visible wherever prices are.

### Starting

1. A new clinic signs up and goes through onboarding as today (the workspace must exist
   before a subscription can attach to it — *my call* on ordering).
2. It then lands on choosing a plan: Basic or Pro, monthly or yearly. **"Start free
   trial" is the primary offer** on both plans.
3. Paddle's checkout takes the card up front. The trial starts immediately.
4. When the trial ends, Paddle charges the card automatically unless the clinic
   cancelled before then. The checkout and the Billing section must say plainly when the
   first charge will happen and how much it is.
5. A workspace with no plan yet (signed up, never finished checkout) cannot use the
   workspace; it is sent back to choosing a plan.
6. **One free trial per clinic** (*my call*): a workspace that has already had a trial
   and comes back later pays from day one.

### Later offer: a free Pro trial for Basic clinics

The owner wants to be able to offer a clinic that pays for Basic a free 14-day Pro trial
"after some time". *My call:* this is triggered by the owner per clinic from the owner
page (below), not automatically. The clinic then sees the offer in Settings → Billing;
accepting it gives Pro features immediately for 14 days, during which its Basic
subscription keeps running unchanged. Before the 14 days end it chooses: **keep Pro**
(its subscription moves to the Pro price, prorated) or **stay on Basic** (nothing to
pay). If it does neither, it goes back to Basic — Vela never moves a clinic onto a
higher price it didn't explicitly choose (*my call*: an auto-upgrade charge outside
Paddle's own trial flow would skip the card-network trial reminder).

### Changing and cancelling (*my calls*, standard SaaS behaviour)

- Every plan or interval change (Basic ↔ Pro, monthly ↔ yearly) takes effect
  immediately, with Paddle's proration: a move to a higher price charges the difference
  now, a move to a lower price credits the difference to the next bill. (Paddle can't
  schedule a price change for the end of a period, and immediate-with-proration is what
  most SaaS do.)
- During a trial, a change keeps the original trial end date; the new price applies
  from then and nothing is charged before.
- Cancelling: the clinic keeps full access until the end of the period it already paid
  for (or the end of its trial), then the workspace locks.
- Card and invoice management, and cancelling, happen through Paddle's own customer
  portal, opened from Settings → Billing ("Manage plan"). Vela does not build its own
  card form.

### Not paying → locked (owner decision)

A **locked** workspace can still sign in and **see everything**: clients, appointments,
records, documents, payments, conversations. It **cannot use the app**:

- no creating or changing anything (clients, bookings, records, staff, settings other
  than billing);
- no Reports page;
- no automations and no reminders — **no message of any kind goes to a patient** from a
  locked workspace;
- no WhatsApp sending. Inbound patient messages are still received and stored so nothing
  is lost and the clinic can read them, but reply-driven actions (a "2" cancelling a
  visit) are not applied while locked (*my call*);
- the staff mobile app is read-only in the same way (*my call*).

The only thing that works is getting unlocked: a clear, calm banner/screen leading to
Billing, where the clinic restarts or fixes its subscription. Paying unlocks everything
at once; nothing is deleted while locked.

When the lock happens:
- cancelled → at the end of the paid period or trial;
- card fails → *my call:* the clinic keeps working while Paddle retries the payment
  (by default up to 7 times over 30 days), with a banner asking them to update their
  card; it locks when Paddle gives up and cancels the subscription.

### Keeping a locked clinic's data (owner decision: 90 days)

GDPR's storage-limitation rule means a clinic that has left can't have its patients'
records kept forever. A locked workspace's data is kept for **90 days from the day it
locked**. The lock screen states the date ("Your records are kept until 24 January
2027"). While locked, everything already in Vela stays downloadable (documents, payment
statements). Restarting the subscription within the 90 days unlocks everything.

*My call on deletion:* after 90 days the owner page lists the workspace as "due for
deletion", and the owner deletes it there (with a confirmation). Vela never deletes a
clinic on its own — an automatic job that wipes clinics is too dangerous to run
unattended, and the owner already does deletes by hand. Retention reminder emails need
an app email channel that doesn't exist yet; the lock screen carries the date instead.

### Refunds (my call, from the research)

Paddle requires a refund window of 14–90 days, no "all sales are final"-style
conditions, and refund requests made through Paddle (paddle.net). The policy becomes:
a full refund within **14 days of the first payment** after a trial and of the first
payment of a yearly plan; later renewals are not refundable except where the law
requires it; duplicate or mistaken charges are always refunded. Paddle's own buyer
terms apply on top (EU/UK consumers' statutory rights).

### Pilot clinics and the owner page (owner decision)

The owner creates pilot clinics themselves and decides per clinic whether it is **free** or
**has to pay**. *My call on the mechanism:* a small owner-only page (not visible to
clinics, gated to the owner's own account(s), e.g. by an email allow-list in an env var)
that lists workspaces with their plan state and lets the owner:

- mark a workspace as a **free account** (picks Basic or Pro; never sees checkout, never
  locks), or turn that off — which sends the clinic to choosing a plan, **with the normal
  free trial** (owner decision: time on a free account does not use up the trial);
- offer a Basic clinic the free Pro trial.

**Rollout safety:** every workspace that exists when this ships becomes a free account
on its current plan, so nothing locks on deploy. The owner then turns off the ones that
should pay.

The owner page also lists locked workspaces past their 90 days as "due for deletion",
with a confirmed Delete.

## Constraints

- **Paddle Billing** (not Paddle Classic). Build and test against Paddle's **sandbox**
  account first; switch to the owner's live account by changing environment variables
  only — no code change.
- **Paddle is the source of truth for money.** Vela's plan state is updated only from
  Paddle's signed webhooks (verify the signature; ignore duplicates and out-of-order
  events), never from the browser returning from checkout. The success page may show
  "setting up your plan…" until the webhook lands.
- Secrets (API key, webhook secret) are server-only env vars; only Paddle's public client
  token reaches the browser. Never log them.
- **Paddle only ever receives billing data** — the clinic's name and the owner's email.
  No patient data goes to Paddle (CLAUDE.md patient-data rules).
- Customer-facing copy never names Paddle's internals or raw errors (CLAUDE.md
  "customer-facing language hides providers"); "Manage plan", "Update card", not
  provider jargon. No fabricated popularity badges (AGENTS.md).
- Feature gating already uses `isProBusinessPlan()`; the lock must be enforced
  **server-side in one place** that every server action, page mutation, mobile API write,
  cron sender and the WhatsApp send path consults — not by hiding buttons alone. Hidden
  buttons are the polish on top.
- Small, single-purpose PRs merged one at a time (owner rules).
- Schema changes go through `db push` without `--accept-data-loss`.

## Non-goals

- No coupons, discounts, seat-based pricing, or the `ADVANCED` plan.
- No custom card form or invoice PDFs inside Vela (Paddle's portal and emails cover it).
- No automatic "Pro trial after N months" — owner-triggered only.
- No full "export my whole workspace" feature in this work (locked clinics can still
  download what each record already offers).

## Legal pages (owner asked for them to be updated, 2026-10-26)

Terms, Privacy and Refund are rewritten to what Paddle's domain review and GDPR require
(see the research in the 2026-10-26 conversation; Paddle's seller-policy requirements):
- **Terms:** the legal entity's name, the mandatory Merchant of Record sentence ("Our
  order process is conducted by our online reseller Paddle.com. Paddle.com is the
  Merchant of Record for all our orders."), trials, automatic renewal, cancellation,
  the lock and the 90-day retention, suspension for non-payment.
- **Refund:** the policy above, requests through paddle.net.
- **Privacy:** legal name and registered address, controller status, legal basis per
  purpose, Paddle named as a recipient of billing data, international-transfer
  safeguards, full GDPR rights answered within one month, cookie notice, retention
  including the 90 days.
- The wording stays factual and needs a lawyer's read before launch (the GDPR legal
  assessment is still outstanding, ROADMAP §5). The legal entity's name and registered
  address must come from the owner.

## Anti-goals (would be a failure even if it technically works)

- A clinic charged without having been told when and how much.
- A locked clinic that can still message patients, or a paying clinic that gets locked
  because a webhook was missed or arrived out of order.
- Existing clinics locking the moment this deploys.
- Plan state that only changes because the browser said checkout succeeded.

## Left to the builder

- Data model: which fields to add to `Business` (or a separate subscription table) for
  Paddle customer/subscription ids, interval, period end, "free account", "had a
  trial", and how they map onto the existing `plan` / `planStatus` / `trialEndsAt`.
- How the "one trial per clinic" and the Pro-trial offer are expressed in Paddle (trial
  vs. no-trial prices, subscription item changes).
- Overlay vs inline Paddle checkout; how localized prices are fetched for the pricing
  page; handling of Paddle being unreachable (show base USD prices).
- The exact server-side lock seam and how cron senders skip locked workspaces.
- PR breakdown and order.
