# No-show tracking, waiting list, and grunt-work workflows — design

Date: 2026-09-22 · Status: draft for owner review · Author: Claude (brainstorm with the owner)

## Goal

Make Pro worth $79 and take repetitive follow-up work off clinic staff, without adding complexity for them. Concretely:

1. Record **no-shows** as a real appointment outcome and report on them.
2. Show **which upcoming appointments are most likely to be no-shows**, and why.
3. When a booked patient cancels, **prepare an offer of the freed slot** to patients waiting for an earlier time.
4. Add four small workflows that remove daily grunt work: confirm by reply, rebooking nudges, unpaid-balance reminders, after-visit thank-you.

Out of scope for this spec: Paddle/billing (later), the OpenAI key (set at launch), audit logging/RBAC, SMS/email channels (WhatsApp/Baileys only, through the `sendMessage` seam), any AI-generated message text.

## Owner decisions (2026-09-22)

| Decision | Choice |
|---|---|
| Slot filling | Vela **drafts**, staff taps Send. Never auto-sends an offer. |
| Who is offered a slot | Only patients **on a waiting list staff build**. No cold messages to booked patients. |
| Workflows to build | Confirm by reply, rebooking nudges, unpaid-balance reminder, after-visit thank-you. |
| Where drafts live | A **Follow-ups** page reached from the Inbox area (own URL, not a sidebar item). *Interpretation of "a follow ups page inside the inbox catalog" — confirm.* |
| Reply "2" to cancel | **Cancels** the appointment, sends the patient a short confirmation, tells staff, and triggers the waiting-list offer. |
| Plan placement | **Pro:** no-show status, risk score, waiting list, rebooking nudges. **Basic:** confirm by reply, unpaid-balance reminder, after-visit thank-you. |
| Basic reports | Basic keeps a basic reports view (separate spec; this one only avoids blocking it). |

## Approach

One shared mechanism: a **drafted-message list ("Follow-ups")**. Slot offers, rebooking nudges, payment reminders, and thank-yous each *produce drafts*; staff clear them with Send or Skip; sending goes through `sendMessage` and the message lands in the patient's Inbox thread like any other. Confirm-by-reply is not a draft — it is an automatic update from a patient's reply.

Rejected: a separate screen per workflow (scattered, five times the UI), and auto-sending everything (a mistaken cancellation or double offer reaches patients before anyone can stop it). A per-workflow "send automatically" switch is deliberately **not** in v1; it is a later, low-risk addition once the drafts exist.

## Data model

New enum value and two models. Additive migration; no data rewrite.

- `AppointmentStatus` += `NO_SHOW`.
- `WaitlistEntry` — `id`, `businessId`, `clientId`, `service` (free text, matches `Appointment.title`), `staffMemberId?`, `earliestDate?`, `preferredDays` (weekday ints), `preferredFrom/To` (time-of-day window, optional), `notes?`, `status` (`WAITING` | `OFFERED` | `FILLED` | `REMOVED`), timestamps. Indexed by `(businessId, status)`.
- `FollowUpDraft` — `id`, `businessId`, `clientId`, `kind` (`SLOT_OFFER` | `REBOOK` | `PAYMENT` | `THANK_YOU`), `body`, `status` (`PENDING` | `SENT` | `DISMISSED` | `EXPIRED`), `appointmentId?`, `waitlistEntryId?`, `dedupeKey` (**unique per business**), `expiresAt?`, `sentAt?`, timestamps. Indexed by `(businessId, status, createdAt)`.
- Settings: workflow switches and timings (rebook after N months, thank-you delay in hours, payment reminder after N days) live on a new `WorkflowSettings` row per business, defaults on for Basic workflows and off until enabled for Pro ones.

Risk scores are **not stored**. They are computed from appointment history when shown (bounded query for the clients on screen), so there is nothing to keep in sync.

## Components

### 1. No-show status (Pro)
- Appointment edit form and quick actions gain "No-show" (Pro workspaces only). `NO_SHOW` behaves like a finalized, non-billable outcome: it frees nothing (the time has passed), counts in Reports, and is styled as its own status tone in the calendar/dashboard/status donut.
- **End-of-day list:** a small card on the Dashboard (and a link in Calendar) lists today's past appointments still Pending/Confirmed — "Did they come?" with Completed / No-show buttons. This is how no-shows actually get recorded without editing each appointment.
- **Reports:** a real no-show rate (no-shows ÷ finalized visits) added beside the Lost-slot rate; the status donut gains a No-show slice. The existing `noShows: 0` placeholder on the client profile is replaced by the real count.
- Downgrade edge case: `NO_SHOW` rows stay readable on a Basic workspace (shown as "No-show"), but Basic cannot set the status.

### 2. No-show risk score (Pro)
- Pure function `scoreNoShowRisk(history, appointment)` → `{ level: "low" | "medium" | "high", reasons: string[] }`. Signals from the patient's own history: no-shows and late cancellations in recent visits, unconfirmed reminder, long booking lead time. (A first-ever visit has no history to score, so it falls under the minimum-data rule below rather than being a signal of its own.) Transparent weights, unit-tested, no OpenAI.
- Shown as a small Low/Medium/High marker with the top reason on the appointment quick-view and Day view; High is highlighted on the Dashboard schedule. Minimum data rule: with fewer than 2 past visits the score says "not enough history" rather than guessing.
- Risk does **not** auto-cancel or double-book anything; it only informs staff.

### 3. Follow-ups list
- Page at `/inbox/follow-ups`, linked from the Inbox header as a "Follow-ups" tab with a pending count; the Dashboard Messages card shows the count too. One row per draft: patient, kind, the message text (editable before sending), reason ("Cancelled slot, Thu 10:00"), Send and Skip.
- Send goes through `sendMessage`; outcome is recorded; a failed send stays pending with a plain error. Drafts expire (a slot offer once the slot passes; others after a set number of days).
- Dedupe: `dedupeKey` (e.g. `SLOT_OFFER:{appointmentId}:{waitlistEntryId}`, `PAYMENT:{paymentId}`, `THANK_YOU:{appointmentId}`, `REBOOK:{clientId}:{month}`) makes generation idempotent so the hourly job and retries can never double-draft.
- Message text obeys minimum-necessary: name + time (+ amount for payments). No service or clinical wording.

### 4. Waiting list + slot offers (Pro)
- Add to the waiting list from a client profile or the calendar; edit/remove from the same place.
- Trigger: the shared `cancelAppointmentCore` (used by both the web action and the mobile API, so both paths behave the same) enqueues slot-fill matching for the freed slot. Matching: same service, provider if the entry names one, weekday/time window fits, ordered by how long they've waited. Creates one `SLOT_OFFER` draft for the best match.
- Staff sends; entry moves to `OFFERED`. Offers go out one at a time. When the patient says yes, staff books them into the slot with one tap from the Follow-ups row (pre-filled New appointment) and the entry moves to `FILLED` — a reply is never turned into a booking automatically. A pass, or no reply, lets staff move to the next match, which creates the next draft. If the slot is booked another way, the pending draft expires.

### 5. Confirm by reply (Basic)
- Reminder template appends "Reply 1 to confirm, 2 to cancel". The inbound handler (`recordInboundMessage`) gains a reply reader: a reply of `1`/`yes`/`confirm` (and Albanian/common equivalents, configurable list) from a patient with a reminded upcoming appointment sets it `CONFIRMED`; `2`/`cancel` cancels it through `cancelAppointmentCore`, replies with a short confirmation, and notifies staff.
- Only acts when exactly one upcoming reminded appointment matches, so an ambiguous reply is left for a human. Anything else is stored as a normal message.

### 6. Rebooking nudges (Pro), unpaid-balance reminder (Basic), after-visit thank-you (Basic)
- Generated by the existing hourly cron (a new step after reminders, same fairness/cursor pattern), each writing `FollowUpDraft`s:
  - **Rebook:** last completed visit older than N months, no future appointment, no open draft.
  - **Payment:** an unpaid or overdue `ClientPayment` older than N days, one draft per payment.
  - **Thank-you:** a visit marked Completed within the delay window.

## Plan gating

`isProBusinessPlan()` gates: `NO_SHOW` set/recording UI, risk score display, waiting list, `SLOT_OFFER` and `REBOOK` draft generation. Server actions re-check the plan (UI gating alone is not enough). Basic gets `PAYMENT`, `THANK_YOU`, confirm-by-reply, and the Follow-ups page. `WorkflowSettings` toggles for gated workflows are hidden on Basic.

## Risks and edge cases

- **Wrong-patient messages:** every send resolves the client by id from the draft, never by re-matching a phone.
- **Duplicate drafts / double sends:** a unique `dedupeKey` makes draft *generation* idempotent; sending flips status atomically (`PENDING → SENT` conditional update) so two staff tapping Send at once cannot send twice. That does not make the send itself exactly-once: if the provider call times out after the worker accepted the message, the person sees a failure and the draft returns to Pending. Nothing retries a send on its own — a person always decides whether to send again — and no provider idempotency key is claimed.
- **Time zones:** all "N hours/days" windows use the clinic zone helpers in `lib/time-zone.ts`, not server-local dates (a recurring bug class in this repo).
- **Patient data:** drafts hold patient names and appointment times only; they stay inside Postgres; nothing new goes to a third party. Logs carry record ids, not names.
- **Consent/WhatsApp:** messages go only to existing clients with a phone the clinic already messages; a disconnected WhatsApp connection keeps drafts pending with a clear "connect WhatsApp" state.
- **Reply misreads:** the reply reader only acts on exact, unambiguous replies (see above); everything else is untouched.

## Testing

- Unit: `scoreNoShowRisk` (signal weights, thin-history case), slot matching, reply reader, dedupe-key generation, draft expiry, time-window math (including DST cases).
- Action tests: plan gating rejects Basic on every Pro action; atomic send; cancel → offer draft; cancel via mobile path behaves identically.
- Cron test: idempotent across repeated runs and partial failures.
- Browser QA on the seeded clinic: end-of-day list, risk markers, Follow-ups list, waiting-list add/offer/fill, reply confirm.

## Rollout — small separate PRs, each reviewed by CodeRabbit

1. `NO_SHOW` status + end-of-day list + Reports no-show rate (migration).
2. Risk score (pure function + UI markers).
3. `FollowUpDraft` + Follow-ups page + confirm by reply.
4. Waiting list + slot offers.
5. Thank-you, payment reminder, rebooking nudges — one PR each, reusing the list.

AGENTS.md and the pricing copy (`lib/public-plans.ts`) are updated in the PR that ships each feature — the plan copy must not promise a feature before it exists. Per-workflow settings UI ships with the workflow it controls.

## Open items for the owner

- Confirm the Follow-ups page placement (Inbox tab with its own page).
- Approve the schema additions (`NO_SHOW`, `WaitlistEntry`, `FollowUpDraft`, `WorkflowSettings`); applying to production needs its own explicit go-ahead.
- Default timings: rebook after 6 months, thank-you 2 hours after a completed visit, payment reminder 3 days after an unpaid balance — adjust if you prefer.
