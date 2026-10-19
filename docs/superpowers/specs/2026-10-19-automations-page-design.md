# Automations page — design

Status: approved by the owner in conversation, 2026-10-19. Mockups that informed it: `.superpowers/brainstorm/1295-1792440071/content/` (`layout-v2.html` option A1, `editor-v3.html`).

## Why

Today the clinic's automatic patient messages are scattered and thin:

- **Settings → Reminders**: the two appointment reminders (switch + "Nh before") and one shared editable template.
- **Settings → Workflows**: three toggle rows (Rebooking nudge, Unpaid payment reminder, Thank-you) with a timing select. Their wording is hard-coded in `lib/workflow-generators.ts`; nothing can be edited, previewed, or measured.
- **Invisible**: the waiting-list slot offer (hard-coded text in `lib/slot-offers.ts`), reply-to-confirm/cancel handling, no-show risk.
- **Inbox › Follow-ups** holds the drafts these produce, separate from where they are configured.

The owner wants one dedicated, well-designed place where every automation can be switched, timed, worded, and reviewed — and wants the set expanded with genuinely valuable automations.

## Goals

1. A new **Automations** page in the sidebar (between Inbox and Reports) — the only place automations are configured.
2. **Twelve automations**, each with: on/off, timing, "automatically" vs "after I review it" (Pro), and a fully editable message with a live preview.
3. The review queue (today's Inbox › Follow-ups) moves into the page as **To review**; an **Activity** tab logs what was sent.
4. Six new automations that send real value: Booking confirmation, New patient welcome, High-risk reminder, Visit moved or cancelled, Missed visit, Check-up due.

## Non-goals

- No new channels (WhatsApp only, through the existing `sendMessage` seam).
- No per-automation analytics dashboards; Activity is a plain log plus counts.
- No birthday greeting (dropped by the owner as low value).
- No clinic-address field. The New patient welcome is editable, so a clinic types its own address into the message if it wants one.
- No changes to the reply-to-confirm/cancel parser (`lib/messaging/inbound.ts`).

## Anti-goals (would make this a failure even if it works)

- A patient receiving **two messages for one event** (e.g. booking confirmation *and* new patient welcome for a first booking; a reschedule notice *and* a fresh reminder in the same minute; a retry re-sending).
- **Clinical detail** in any message. Minimum-necessary stays enforced in code: only whitelisted tokens render; anything else renders empty.
- A Basic clinic silently losing messages it was promised without the UI saying why.
- Messages to patients the clinic didn't intend (e.g. a migration that makes old visits "due" for a new automation and fires a burst).

## The twelve automations

Grouped in visit order. Card order in the 3-column grid is left-to-right, top-to-bottom exactly as listed.

| # | Automation | Trigger | Timing control | Default mode | Default on | Plan |
|---|---|---|---|---|---|---|
| 1 | Booking confirmation | A visit is booked by the clinic | none ("right after booking") | Automatic | on | Pro |
| 2 | New patient welcome | A client's **first ever** booking (sent **instead of** #1) | none | Automatic | on | Pro |
| 3 | First reminder | Before each visit | 1–24 h before (today's `firstReminderHours`) | Automatic | on | **Basic + Pro** |
| 4 | Second reminder | Before each visit | 1–24 h before (`secondReminderHours`) | Automatic | on | Pro |
| 5 | High-risk reminder | Before a visit scored **high** no-show risk | 1–24 h before (default 5 h) | Automatic | **off** | Pro |
| 6 | Visit moved or cancelled | The **clinic** moves a visit's time or cancels it (not when the patient cancels by reply) | none | Automatic | on | Pro |
| 7 | Thank-you | After a completed visit | hours after (today's `THANK_YOU_HOUR_OPTIONS`, `thankYouDelayHours`) | Automatic | on | **Basic + Pro** |
| 8 | Missed visit | A visit is marked no-show | 1–24 h after the mark (default 1 h) | Review first | on | Pro |
| 9 | Payment reminder | An unpaid payment entry | days after (today's `PAYMENT_REMINDER_DAY_OPTIONS`, `paymentReminderAfterDays`) | Automatic | on | Pro |
| 10 | Check-up due | A client follow-up reminder (`ClientFollowUpReminder.remindAt`) arrives | none ("on the follow-up date") | Review first | on | Pro |
| 11 | Rebooking nudge | No visit for N months | months (today's `REBOOK_MONTH_OPTIONS`, `rebookAfterMonths`) | Review first | off (as today) | Pro |
| 12 | Waiting-list offer | A booking is cancelled and a waiting-list match exists | none | Review first | on | Pro |

Plan rules (owner decision):
- **Basic** gets #3 First reminder and #7 Thank-you only, both **always automatic** (no mode choice on Basic). Every other card is Pro.
- This is a change: Basic clinics lose the second reminder and the payment-reminder drafts they have today. The Basic page shows those cards as "Pro" (upgrade), never as silently broken.
- Enforcement lives in the engine (server), not just the UI.

Defaults for existing clinics come from their current settings (see Migration). Mode/template defaults apply where no prior setting exists.

### Default messages

Tokens are written `{client_name}`, `{date}`, `{time}`, `{staff_name}`, `{clinic_name}`. The editor's "+ Insert detail" offers: name, date, time, staff name, clinic name — only the tokens that kind supports.

| Automation | Default text | Tokens allowed |
|---|---|---|
| Booking confirmation | `Hi {client_name}, your visit at {clinic_name} is booked for {date} at {time}. Reply here if you need to change it.` | name, date, time, staff, clinic |
| New patient welcome | `Welcome to {clinic_name}, {client_name}! Your first visit is on {date} at {time}. Reply here if you have any questions.` | name, date, time, staff, clinic |
| First reminder | the clinic's current template, else `DEFAULT_REMINDER_TEMPLATE` (keeps "Reply 1 to confirm or 2 to cancel") | name, date, time, staff, clinic |
| Second reminder | `Hi {client_name}, see you today at {time}. Reply 2 if you can't make it.` — **unless** the clinic has a custom template today, in which case both reminders keep it (today's behaviour) | name, date, time, staff, clinic |
| High-risk reminder | `Hi {client_name}, can you still make your visit at {time} on {date}? Reply 1 to confirm or 2 to cancel so we can offer the time to someone else.` | name, date, time, staff, clinic |
| Visit moved or cancelled | two texts, chosen by event: moved → `Hi {client_name}, your visit has moved to {date} at {time}. Reply here if the new time doesn't suit you.`; cancelled → `Hi {client_name}, your visit on {date} at {time} has been cancelled. Reply here to book a new time.` The editor shows both boxes. | name, date, time, staff, clinic |
| Thank-you | `Thank you for visiting us, {client_name}! We hope to see you again soon.` (today's text) | name, clinic |
| Missed visit | `Hi {client_name}, we missed you today. Would you like to book a new time?` | name, clinic |
| Payment reminder | today's text (`workflow-generators.ts`) | name, clinic |
| Check-up due | `Hi {client_name}, it's time for your check-up at {clinic_name}. Would you like to book a visit?` | name, clinic |
| Rebooking nudge | today's text | name, clinic |
| Waiting-list offer | today's `slotOfferBody` text, `{date}`/`{time}` = the freed slot | name, date, time, clinic |

The reply-to-confirm/cancel instructions are part of the default reminder wording; the parser is unchanged. "Reset to default" restores the table's text.

Rendering rule (minimum-necessary, enforced): one function renders every automation; a token not in that kind's whitelist renders empty, exactly like `renderReminder` today. Customer-facing copy never names providers. Messages never contain the appointment's service/title or notes.

## Page structure

Route group: `src/app/(workspace)/automations/`.

- `/automations` — **Automations** tab (default).
- `/automations/review` — **To review** tab (Pro). Replaces `/inbox/follow-ups`, which redirects here.
- `/automations/activity` — **Activity** tab.

Header: title "Automations" and the three tabs on the right (same tab treatment as the mockup; individual buttons, no joined segmented box — AGENTS.md rule 7). "To review" carries a live count badge when > 0. Basic workspaces don't see the To review tab (nothing can be in review on Basic).

### Automations tab (A1 cards)

- A `grid-cols-3` × 4-row grid that **fills the viewport height** below the header on `lg+` (same fill pattern as Calendar/Inbox, e.g. `lg:h-[calc(100vh-<header>)]`, `grid-rows-4`), so there is no blank space beneath it. Below `lg` it stacks to 2 then 1 column at natural height.
- Each card: name (semibold) + switch on the first row; timing phrase (muted) left and mode word right on the second row ("Automatic" green-ish, "Review first" amber, "Off" faint). Nothing else. Flat white card, `--radius-card`, border, hover border darken. No icons (rule 7), no dividers (rule 6).
- Clicking the card body opens the editor; the switch toggles in place and saves immediately (optimistic, reverted on failure).
- Basic: Pro-only cards show a small "Pro" label where the switch is, muted name; clicking opens the existing upgrade path (`/checkout?plan=pro` via the same pattern `ProFeatureLock` uses). First reminder and Thank-you behave normally.

### Editor (E2, simplified — `editor-v3.html`)

A centered dialog (existing `Dialog` primitive), two columns, no description lines:

- **Left column**: title + switch on one row; one sentence with inline pickers — "Send **14 hours before** the visit, **automatically**." (the second picker offers "automatically" / "after I review it"; omitted on Basic and for kinds with no timing the sentence reads e.g. "Send right after booking, **automatically**."); a "Message" label above a textarea; under it "+ Insert detail" (left, opens a small menu of allowed tokens, inserts at the cursor) and "Reset to default" (right, faint). Cancel / Save at the bottom right. Visit moved or cancelled shows two labelled boxes ("When moved", "When cancelled").
- **Right column**, edge to edge: the patient's phone preview — **brand light-blue background** (a tint from the brand `#64B6FF` family, not WhatsApp cream; owner request), a white message bubble rendering the live text with sample values (Maya, Tue 21 Oct, 10:30, the clinic's real name, a real staff name when one exists), a faint "Updates as you type" line, and the dialog's close button top-right.
- Save validates: non-empty, ≤ 600 characters, timing within its allowed options. Errors use product language.
- Settings Save/Discard pattern is **not** used here; each editor saves its own automation.

### To review tab

The current Follow-ups list (`components/inbox/follow-ups-list.tsx`, kind chips with live counts, rows with Edit / Skip / Send, slot-offer Book/Declined) moved as-is, extended to the new review-capable kinds (Missed visit, Check-up due, plus any automation a clinic switched to "after I review it"). Chips/labels come from the automation registry. Empty state: the existing caught-up `WorkspaceEmptyState`.

### Activity tab

A single list (newest first, last 30 days, paginated server-side) of automated sends: automation name, patient name (links to the client), when, delivery status (Sent / Delivered / Read / Failed). Filter chips by automation with counts (only automations that have sends). Above the list, nothing else — no KPI tiles.

### Navigation and Settings

- `lib/navigation.ts`: add `{ label: "Automations", href: "/automations", icon: <a lucide icon, e.g. Workflow> }` after Inbox. `proxy.ts` protects `/automations`.
- Settings popup: remove the **Reminders** and **Workflows** sections. `?settings=reminders|workflows` deep links redirect to `/automations`.
- Notifications bell / dashboard links that point at `/inbox/follow-ups` point at `/automations/review`.
- The WhatsApp-down banner copy is unchanged.

## Data model

New model and enums (additive migration; old tables stay until a follow-up cleanup PR drops them):

```prisma
enum AutomationKind {
  BOOKING_CONFIRMATION
  NEW_PATIENT_WELCOME
  FIRST_REMINDER
  SECOND_REMINDER
  HIGH_RISK_REMINDER
  VISIT_CHANGED
  THANK_YOU
  MISSED_VISIT
  PAYMENT_REMINDER
  CHECKUP_DUE
  REBOOK
  WAITLIST_OFFER
}

enum AutomationMode {
  AUTOMATIC
  REVIEW
}

model AutomationSetting {
  id          String         @id @default(cuid())
  businessId  String
  business    Business       @relation(fields: [businessId], references: [id], onDelete: Cascade)
  kind        AutomationKind
  enabled     Boolean
  mode        AutomationMode
  timing      Int?           // hours, days or months depending on kind; null for kinds without timing
  template    String?        // null = default text
  template2   String?        // VISIT_CHANGED only: the "cancelled" text (template = "moved")
  updatedAt   DateTime       @updatedAt

  @@unique([businessId, kind])
}
```

- `FollowUpDraftKind` gains `BOOKING_CONFIRMATION`, `NEW_PATIENT_WELCOME`, `VISIT_CHANGED`, `MISSED_VISIT`, `CHECKUP_DUE` (rebook/payment/thank-you/slot offer already exist).
- `FollowUpDraft` gains `autoSend Boolean @default(false)` — the automation's mode **snapshotted when the draft is created**; only `autoSend` drafts are ever dispatched without a person, so changing a mode (or deploying this feature) never sends an existing backlog — and `sendAfter DateTime?` — the earliest dispatch time (Missed visit's delay); the sweep and the To review list ignore a draft before it.
- `AppointmentReminderType` gains `HIGH_RISK`.
- `Message` gains nullable `automationKind AutomationKind?` set by every automated send, so Activity can label and filter sends.

Settings are read through one helper (`getAutomationSettings(businessId)` in `lib/automations-data.ts`) that merges stored rows over defaults. **Missing rows mean "defaults derived from the legacy tables"**: until a row exists, FIRST/SECOND reminder settings come from `ReminderSettings`, and THANK_YOU/PAYMENT/REBOOK from `WorkflowSettings`. So no backfill script is required before deploy, and a clinic's current behaviour is preserved exactly on the day it ships (apart from the owner-decided plan changes). The first save from the new editor writes the row.

## Engine

One registry, `lib/automations.ts` (pure, no Prisma): the 12 kinds in display order with group, label, timing unit/options, default mode/on, plan availability, allowed tokens, default templates, and `renderAutomationMessage(kind, template, values)`. Every UI and engine path reads from it.

Sending stays on the existing two pipelines; nothing calls the worker directly.

1. **Timed reminders** (`lib/reminders.ts`, every-5-minute cron): FIRST/SECOND as today, now reading timing/template/enabled from `getAutomationSettings`, with SECOND (and HIGH_RISK) skipped for non-Pro. HIGH_RISK is a third type: due when the visit is within its window, risk level is `high` (`getNoShowRiskAssessments`), and it hasn't been sent. Precedence stays "never two reminders in one run for one visit" and "never a longer-lead reminder after a shorter one" (extend `reminderTypeForAppointment` and its tests). Reminders are always automatic (no review mode for 3/4/5 — a reminder that waits for review is late; the editor hides the mode picker for these three).

2. **Everything else goes through `FollowUpDraft`** (the existing outbox with dedupe keys, the send gate, uncertain-delivery handling):
   - A generator creates the draft with the rendered body, as today.
   - **Review mode**: the draft waits in To review (today's behaviour).
   - **Automatic mode**: the draft is created with `autoSend = true` and dispatched without a person. Extract the send path of `sendFollowUpDraftAction` (flip to SENT → confirm → `sendMessage` → mark delivered / revert / uncertain) into `lib/follow-up-dispatch.ts` → `dispatchFollowUpDraft({ draftId, businessId })`, used by both the action and the automatic path. Automatic drafts are dispatched (a) right after the triggering request via Next's `after()` for event automations, and (b) by a sweep in the every-5-minute reminders cron that dispatches any PENDING `autoSend` draft whose `sendAfter` has passed and that is older than a minute (covers `after()` failures and cron-generated drafts). The sweep respects the send rate limits and the cron time budget, and only runs for WhatsApp CONNECTED/ERRORED workspaces.
   - Event generators (called from the mutation paths after commit):
     - Booking confirmation / New patient welcome: `calendar/actions.ts` create. Welcome iff the client has no other non-cancelled appointment ever; otherwise confirmation. Only for visits starting in the future. dedupeKey `booked:<appointmentId>`.
     - Visit moved or cancelled: calendar edit when `startAt` changes, and staff-initiated cancels (calendar cancel, client detail, mobile staff cancel). **Not** the patient's own cancel-by-reply (they get the existing reply acknowledgement). Only for visits still in the future at the time of the change. dedupeKey `changed:<appointmentId>:<reminderGeneration>`; a newer change supersedes (dismisses) an older pending one.
     - Missed visit: when attendance is recorded as NO_SHOW (`recordAppointmentAttendanceCore`); timing = delay after the mark, stored as the draft's `sendAfter`. Undoing the no-show dismisses a pending missed-visit draft.
     - Check-up due: generated by the hourly follow-ups cron for `ClientFollowUpReminder` rows whose `remindAt` has arrived (status Scheduled, client has no future visit). dedupeKey `checkup:<followUpReminderId>`.
   - Thank-you / payment / rebook / slot offer: unchanged generators, now reading timing/template/enabled/mode from `getAutomationSettings`; payment and rebook and slot offer become Pro-only in the generators.
   - Turning an automation **off** dismisses its pending drafts. Switching AUTOMATIC → REVIEW flips its pending `autoSend` drafts to `autoSend = false` so they wait in To review; REVIEW → AUTOMATIC does **not** auto-send the existing backlog (only drafts created afterwards carry `autoSend`) — prevents a burst. Drafts that exist on deploy day all have `autoSend = false` and stay reviewable. Same for turning an automation on: generators only consider events from the moment it was enabled where a backlog could exist (rebook/payment/check-up already cap at `PENDING_CAP_PER_KIND`; in automatic mode cap the per-run auto-dispatch per kind too).

**One message per event.** When a Booking confirmation, New patient welcome, or Visit moved notice is sent for a visit whose first/second reminder window is *already open* at that moment, those already-due reminders are recorded as SENT without sending (the confirmation states the time). Reminders whose window opens later send normally.

Downgrades: a Pro → Basic workspace keeps its stored rows; the engine simply ignores Pro kinds and the page shows them locked.

Every automated outbound `Message` row records `source` (REMINDER / FOLLOW_UP as today) **and** `automationKind`.

## Migration and rollout

- Additive schema (new enums/values, new table, new nullable columns) applied with `npm run db:push` (no `--accept-data-loss`), before the code that reads it deploys.
- No data backfill; legacy tables are the defaults source until a clinic saves (see Data model). A later cleanup PR copies remaining legacy values into rows and drops `ReminderSettings`/`WorkflowSettings` — out of scope here.
- Existing pending drafts keep working; their kinds map to automations by `FollowUpDraftKind`.
- New automations default **on** only where noted; on deploy day they can only fire for **new events** (bookings, changes, no-shows, follow-up dates) — never retroactively for old visits. Check-up due only considers `remindAt` from deploy time forward (store the automation's first-enabled time, or simply `remindAt >= now - 1 day`).

## Docs to update

AGENTS.md: a new "Automations" page-direction section (replacing Settings → Reminders/Workflows bullets and Inbox › Follow-ups), the Plans section (Basic = first reminder + thank-you), and the Messaging rules (follow-ups may now send automatically when the clinic chooses; drafts in review mode still never send themselves). CLAUDE.md: data model list (AutomationSetting), the cron description. PROJECT_STATUS.md entry.

## Left to the builder

- Exact lucide icon, exact grid fill height, light-blue tint value, and spacing — within AGENTS.md's workspace rules.
- Pagination size for Activity; whether To review keeps its current component file or moves to `components/automations/`.
- Internal helper names beyond those named above.
