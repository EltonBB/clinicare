# Automations Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated Automations page (sidebar) where a clinic switches, times, words and reviews twelve automatic patient messages, with six new automations.

**Architecture:** One pure registry (`lib/automations.ts`) describes the twelve kinds; one data helper merges stored `AutomationSetting` rows over legacy-derived defaults. Reminders keep their 5-minute cron; every other automation flows through the existing `FollowUpDraft` outbox, with `autoSend` drafts dispatched by `after()` and a sweep. The page is three routes under `(workspace)/automations`.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` for `after()` and route conventions before using them), React 19, Prisma 6, Zod 4, Vitest, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-10-19-automations-page-design.md`

## Global Constraints

- Every outbound message goes through `sendMessage` (`lib/messaging`); never call the worker directly.
- Minimum-necessary: a token outside the kind's whitelist renders empty; the appointment title/service and notes never appear in any message.
- Customer-facing copy never names Baileys/WhatsApp-provider internals, Prisma, Supabase, OpenAI; no em-dashes in visible copy.
- Plan rule: Basic = `FIRST_REMINDER` + `THANK_YOU`, both always automatic. Everything else Pro. Enforced server-side.
- Action ids validated with `parseRecordId`; actions return typed result objects; revalidate `/automations`, `/automations/review`, `/inbox`, `/dashboard` after automation mutations.
- Workspace visual laws (AGENTS.md): square tiles, no decorative icons, no dividers, no joined button groups, muted workspace accent, no gradients.
- Schema changes are additive only (`npm run db:push`, never `--accept-data-loss`).
- Small single-purpose PRs: one PR per Part below, each through the CLAUDE.md review loop before the next starts.
- Standard gates before every push: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.

## Review Focus

1. A visit booked 30 minutes ahead (Pro, WhatsApp connected) gets **one** message (the confirmation); the already-open second reminder is recorded SENT without sending. Test in Task 10.
2. On deploy day, existing PENDING drafts (all `autoSend = false`) are never dispatched by the sweep. Test in Task 6.
3. A Basic clinic with a custom reminder template keeps it on the first reminder and gets no second reminder. Test in Task 4.
4. A custom template containing `{service}`, `{notes}` or `{unknown}` renders those as empty. Test in Task 2.
5. A patient cancelling by replying "2" gets no "visit cancelled" notice. Test in Task 11.

---

## Part A — Foundation (PR 1)

### Task 1: Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1:** Add `enum AutomationKind` (12 values, spec order), `enum AutomationMode { AUTOMATIC REVIEW }`, `model AutomationSetting` exactly as in the spec's Data model (plus `automationSettings AutomationSetting[]` on `Business`, `@@index([businessId])` covered by the unique). Add `FollowUpDraftKind` values `BOOKING_CONFIRMATION NEW_PATIENT_WELCOME VISIT_CHANGED MISSED_VISIT CHECKUP_DUE`; `FollowUpDraft.autoSend Boolean @default(false)`, `FollowUpDraft.sendAfter DateTime?`, `@@index([businessId, autoSend, status])`; `AppointmentReminderType.HIGH_RISK`; `Message.automationKind AutomationKind?`.
- [ ] **Step 2:** `npx prisma validate` → "The schema ... is valid". `npm run db:generate`.
- [ ] **Step 3:** `npm run db:push` (additive; abort and ask the owner if Prisma asks for `--accept-data-loss`). RLS: enable RLS on `AutomationSetting` with no policies, same as every public table (follow how existing tables were done in `scripts/`).
- [ ] **Step 4:** `npx tsc --noEmit` passes (exhaustive `switch`es over `FollowUpDraftKind` may need the new cases; map them to a label from Task 2 later — for now add `default` only where the compiler forces it). Commit `feat(automations): schema for automation settings`.

### Task 2: Registry and renderer

**Files:**
- Create: `src/lib/automations.ts`
- Test: `src/lib/automations.test.ts`

**Interfaces:**
- Produces:
  - `type AutomationKind` (re-export of the Prisma enum string union)
  - `type AutomationGroup = "before" | "after" | "return"`
  - `type AutomationToken = "client_name" | "date" | "time" | "staff_name" | "clinic_name"`
  - `type TimingUnit = "hours_before" | "hours_after" | "days_after" | "months_after" | null`
  - `type AutomationDefinition = { kind; group; label: string; timingUnit: TimingUnit; timingOptions: readonly number[]; defaultTiming: number | null; defaultMode: "AUTOMATIC" | "REVIEW"; defaultEnabled: boolean; basic: boolean; reviewable: boolean; tokens: readonly AutomationToken[]; defaultTemplate: string; defaultTemplate2?: string; timingPhrase(timing: number | null): string }`
  - `const AUTOMATIONS: readonly AutomationDefinition[]` (spec table order)
  - `function automationDefinition(kind): AutomationDefinition`
  - `function isAutomationAvailable(kind, plan: BusinessPlan): boolean` (`def.basic || isProBusinessPlan(plan)`)
  - `function renderAutomationMessage(kind, template: string | null | undefined, values: Partial<Record<AutomationToken, string>>, variant?: "moved" | "cancelled"): string`
  - `const FOLLOW_UP_KIND_TO_AUTOMATION: Record<FollowUpDraftKind, AutomationKind>`
- Values: labels = spec table names ("Booking confirmation", …, "Waiting-list offer"); default texts = spec "Default messages" table verbatim; `reviewable` false for FIRST/SECOND/HIGH_RISK reminders; `basic` true only for FIRST_REMINDER and THANK_YOU; timing options: reminders and HIGH_RISK and MISSED_VISIT `1..24`; THANK_YOU `THANK_YOU_HOUR_OPTIONS`, PAYMENT_REMINDER `PAYMENT_REMINDER_DAY_OPTIONS`, REBOOK `REBOOK_MONTH_OPTIONS` (import from `lib/settings.ts`); defaults: FIRST 24 (legacy fallback handled in Task 3), SECOND 2, HIGH_RISK 5, MISSED_VISIT 1, THANK_YOU/PAYMENT/REBOOK = `DEFAULT_WORKFLOW_SETTINGS`. FIRST_REMINDER `defaultTemplate` = `DEFAULT_REMINDER_TEMPLATE`. Rendering also maps the legacy reminder default via `effectiveReminderTemplate` for FIRST/SECOND.

- [ ] **Step 1: Failing tests** in `automations.test.ts`:
  - `AUTOMATIONS.length === 12` and `AUTOMATIONS.map(a => a.kind)` equals the spec order.
  - `AUTOMATIONS.filter(a => a.basic).map(a => a.kind)` equals `["FIRST_REMINDER", "THANK_YOU"]`.
  - `renderAutomationMessage("THANK_YOU", "Hi {client_name} {time} {service} {notes} {unknown}", { client_name: "Maya", time: "10:30" })` → `"Hi Maya    "` (time not in THANK_YOU's whitelist → empty).
  - `renderAutomationMessage("BOOKING_CONFIRMATION", null, {client_name:"Maya", clinic_name:"Vela Dent", date:"Tue 21 Oct", time:"10:30"})` → `"Hi Maya, your visit at Vela Dent is booked for Tue 21 Oct at 10:30. Reply here if you need to change it."`
  - `renderAutomationMessage("VISIT_CHANGED", null, {...}, "cancelled")` uses `defaultTemplate2`.
  - `isAutomationAvailable("SECOND_REMINDER", "BASIC") === false`, `isAutomationAvailable("THANK_YOU", "BASIC") === true`, `isAutomationAvailable("REBOOK", "PRO") === true`.
- [ ] **Step 2:** `npx vitest run src/lib/automations.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement. Token replace: `template.replace(/\{(\w+)\}/g, (_, k) => def.tokens.includes(k) ? values[k] ?? "" : "")`.
- [ ] **Step 4:** Tests pass. Commit `feat(automations): registry and minimum-necessary renderer`.

### Task 3: Settings data helper and save action

**Files:**
- Create: `src/lib/automations-data.ts`, `src/app/(workspace)/automations/actions.ts`
- Test: `src/lib/automations-data.test.ts`, `src/app/(workspace)/automations/actions.test.ts`

**Interfaces:**
- Consumes: Task 2 registry.
- Produces:
  - `type AutomationSettingView = { kind; enabled: boolean; mode: "AUTOMATIC" | "REVIEW"; timing: number | null; template: string | null; template2: string | null; available: boolean }`
  - `getAutomationSettings(businessId: string): Promise<Record<AutomationKind, AutomationSettingView>>` — one query for rows + business (plan, reminderSettings, workflowSettings). Precedence per kind: stored row → legacy (`FIRST`: send24HourReminder/firstReminderHours/template; `SECOND`: send2HourReminder/secondReminderHours, template = legacy custom template if one is set, else null; `THANK_YOU`/`PAYMENT_REMINDER`/`REBOOK`: enabled + timing from WorkflowSettings) → registry defaults. For an unavailable kind `enabled` is forced false. For Basic, `mode` is forced `AUTOMATIC`. Non-reviewable kinds always `AUTOMATIC`.
  - Server action `saveAutomationSettingAction(input: { kind; enabled; mode; timing; template; template2 }): Promise<{ ok: true } | { ok: false; error: string }>` — Zod: kind in enum, template trimmed ≤ 600 chars and non-empty when present (empty string → null = default), timing must be in `timingOptions` (null for kinds without timing). Refuses unavailable kinds ("Automations beyond the first reminder and thank-you are part of Pro."). Upserts the row. If `enabled` became false → `followUpDraft.updateMany({ status: PENDING, kind in kinds-for-automation }, DISMISSED)`. If mode went AUTOMATIC→REVIEW → pending `autoSend` drafts of that kind get `autoSend: false`. Revalidates per Global Constraints.
  - `toggleAutomationAction(kind, enabled)` — same path, only `enabled`.

- [ ] **Step 1: Failing tests** (`automations-data.test.ts`, mocked prisma like `actions.test.ts` in `(workspace)`):
  - no rows + ReminderSettings `{ firstReminderHours: 14, template: "Hi {client_name}!" }` → FIRST_REMINDER `{ enabled: true, timing: 14, template: "Hi {client_name}!" }`, SECOND_REMINDER template `"Hi {client_name}!"`.
  - Basic plan → SECOND_REMINDER `{ enabled: false, available: false }`, THANK_YOU `{ mode: "AUTOMATIC" }` even if a stored row says REVIEW.
  - stored row overrides legacy.
  - `actions.test.ts`: Basic saving `REBOOK` → `{ ok: false }`; timing 7 for FIRST_REMINDER (options 1..24) passes, 25 refused; disabling dismisses pending drafts of that kind (assert the `updateMany` call); AUTOMATIC→REVIEW clears `autoSend`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** pass.
- [ ] **Step 5:** Commit `feat(automations): settings read/save`. Open PR "Automations foundation" (no visible change).

## Part B — Engine (PR 2)

### Task 4: Reminders read the new settings; second reminder Pro; high-risk reminder

**Files:**
- Modify: `src/lib/reminder-schedule.ts`, `src/lib/reminders.ts`
- Test: `src/lib/reminder-schedule.test.ts`, `src/lib/reminders.test.ts`

**Interfaces:**
- Consumes: `getAutomationSettings`, `renderAutomationMessage`, `getNoShowRiskAssessments` (`lib/no-show-risk-data.ts`).
- Produces: `reminderTypeForAppointment(args)` now also takes `highRisk: { enabled: boolean; hours: number; isHighRisk: boolean }` and may return `"HIGH_RISK"`. Order of precedence: TWO_HOUR, then HIGH_RISK, then TWENTY_FOUR_HOUR; any shorter-lead reminder already sent suppresses longer-lead ones (extend the existing rule: HIGH_RISK suppressed once TWO_HOUR sent; TWENTY_FOUR_HOUR suppressed once TWO_HOUR or HIGH_RISK sent).

- [ ] **Step 1: Failing tests:** schedule: high-risk visit 4h away with `hours: 5` and nothing sent → `"HIGH_RISK"`; same visit not high risk → `"TWENTY_FOUR_HOUR"` (first=24); visit 1h away → `"TWO_HOUR"`; after TWO_HOUR sent → null. reminders: Basic business with custom template, visit 1h away and first reminder already SENT → no send (second reminder unavailable); Basic visit 20h away → FIRST sent with the custom template; outbound `sendMessage` called with `automationKind: "FIRST_REMINDER"` recorded on the message (extend `SendMessageInput`/mirror to carry `automationKind` and persist it on `Message`).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement. `syncAppointmentRemindersForBusiness` gets settings from `getAutomationSettings`; render the body with `renderAutomationMessage(kind, template, values)` and send `{ kind: "freeform", body }` (keep idempotency key shape `reminder:<id>:<TYPE>:<startAt>:<generation>`). Risk: only fetch assessments when HIGH_RISK is enabled and available, for appointments inside its window. Thread `automationKind` through `sendMessage` → wherever the outbound `Message` row is written.
- [ ] **Step 4:** tests pass; existing reminder tests still pass. Commit.

### Task 5: Follow-up generators read settings; plan gating; autoSend snapshot

**Files:**
- Modify: `src/lib/workflow-generators.ts`, `src/lib/follow-up-generation.ts`, `src/lib/slot-offers.ts`
- Test: `src/lib/workflow-generators.test.ts`, `src/lib/follow-up-generation.test.ts`, `src/lib/slot-offers.test.ts`

**Interfaces:**
- Consumes: Task 3 `getAutomationSettings`, Task 2 renderer.
- Produces: `FollowUpDraftInput` gains `autoSend: boolean` and `sendAfter?: Date`; generators take `settings: AutomationSettingView` instead of `WorkflowSettingsValues` fields and render bodies with `renderAutomationMessage` (values: client_name, clinic_name; slot offer adds the slot's date/time via the existing zoned formatters).

- [ ] **Step 1: Failing tests:** payment candidates are not generated for a Basic business; thank-you on Basic is generated with `autoSend: true`; a Pro clinic with REBOOK mode REVIEW gets `autoSend: false`; a custom THANK_YOU template is used for the body; slot offer body uses the clinic's WAITLIST_OFFER template and `autoSend` follows its mode; WAITLIST_OFFER disabled → `offerFreedSlot` offers nothing.
- [ ] **Step 2–4:** fail → implement (replace `workflowEnabledWhere` with a per-business settings lookup inside the per-business loop) → pass. Commit.

### Task 6: Automatic dispatch

**Files:**
- Create: `src/lib/follow-up-dispatch.ts`
- Modify: `src/app/(workspace)/inbox/follow-ups/actions.ts` (use the extracted function), `src/app/api/cron/reminders/route.ts` (call the sweep after reminders, inside the existing budget)
- Test: `src/lib/follow-up-dispatch.test.ts`

**Interfaces:**
- Produces:
  - `dispatchFollowUpDraft(args: { draftId: string; businessId: string; body?: string }): Promise<{ ok: true; notice?: string } | { ok: false; error: string }>` — the exact flip→confirm→send→delivered/revert/uncertain sequence now in `sendFollowUpDraftAction`, plus `automationKind` on the sent message. The action becomes auth + `manualSendRefusal` + this call + revalidation.
  - `dispatchDueAutomaticDrafts(args: { now: Date; deadlineAt: number; perBusinessCap?: number }): Promise<{ sent: number; failed: number }>` — PENDING, `autoSend: true`, `sendAfter` null or ≤ now, `createdAt` ≤ now − 60s, business WhatsApp enabled and CONNECTED/ERRORED, kind available for the plan; at most `perBusinessCap` (default 20) per business per run; stops at `deadlineAt`.

- [ ] **Step 1: Failing tests:** a PENDING draft with `autoSend: false` is never selected (Review Focus 2); `sendAfter` in the future is skipped; a Basic business's PAYMENT autoSend draft is skipped; a provider failure reverts the draft to PENDING (existing semantics); `deliveryUncertain` marks it SENT. Existing `follow-ups/actions.test.ts` still passes unchanged.
- [ ] **Step 2–4:** fail → implement → pass. Commit; open PR "Automations engine" after the review loop.

## Part C — The page (PR 3)

### Task 7: Route, nav, cards grid

**Files:**
- Create: `src/app/(workspace)/automations/layout.tsx` (header + tabs), `page.tsx`, `loading.tsx`, `src/components/automations/automation-tabs.tsx`, `automation-grid.tsx`, `automation-card.tsx`, `src/lib/automations-view.ts` (`buildAutomationsView(settings, plan, pendingReviewCount)`)
- Modify: `src/lib/navigation.ts` (Automations after Inbox, lucide `Workflow`), `src/proxy.ts` (protect `/automations`)
- Test: `src/lib/automations-view.test.ts`

**Interfaces:**
- Produces: `buildAutomationsView(...) => { cards: { kind; label; enabled; locked: boolean; timingPhrase: string; modeLabel: "Automatic" | "Review first" | "Off" }[]; showReviewTab: boolean; reviewCount: number }`.

- [ ] **Step 1: Failing test:** 12 cards in spec order; Basic → 10 `locked`, `showReviewTab: false`; disabled card `modeLabel: "Off"`; FIRST_REMINDER timing 14 → `"14 hours before"`; BOOKING_CONFIRMATION → `"Right after booking"`; CHECKUP_DUE → `"On the follow-up date"`; REBOOK 6 → `"6 months since the last visit"`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** UI per spec "Automations tab": `lg:grid-cols-3 lg:grid-rows-4` filling `lg:h-[calc(100vh-<measured header>px)]`, `sm:grid-cols-2`, natural height below `lg`. Switch uses the existing toggle primitive (`components/settings/settings-toggle.tsx` or `ui` switch) and `toggleAutomationAction` with optimistic state. Locked card → `Link` to `/checkout?plan=pro`, "Pro" label in place of the switch. Commit.

### Task 8: Editor dialog

**Files:**
- Create: `src/components/automations/automation-editor.tsx`, `automation-phone-preview.tsx`
- Test: `src/components/automations/automation-editor.test.tsx` only if the repo already has component tests; otherwise cover the pure parts (`insertTokenAt(text, cursor, token)`) in `src/lib/automations.test.ts`.

- [ ] **Step 1: Failing test:** `insertTokenAt("Hi !", 3, "client_name")` → `{ text: "Hi {client_name}!", cursor: 16 }`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Build the E2 dialog per spec "Editor": two columns (`grid-cols-[1fr_280px]`, stacked on mobile), sentence with two inline `select`s styled as soft pills (mode picker hidden when `!reviewable` or Basic), textarea (600 max), "+ Insert detail" menu listing the kind's tokens with friendly names (name, date, time, staff name, clinic name), "Reset to default", Cancel/Save calling `saveAutomationSettingAction`, toast on success. VISIT_CHANGED shows "When moved" and "When cancelled" boxes. Preview: brand light-blue panel (a tint of `#64B6FF`, e.g. `#EAF4FF`), white bubble rendering `renderAutomationMessage` with sample values (Maya, the clinic's name, first staff name or the clinic name, next weekday 10:30 formatted with the zoned formatters). Commit.

### Task 9: To review tab, redirects, Settings cleanup

**Files:**
- Create: `src/app/(workspace)/automations/review/page.tsx`
- Move: `src/app/(workspace)/inbox/follow-ups/actions.ts` → `src/app/(workspace)/automations/review/actions.ts` (update imports/tests); `src/components/inbox/follow-ups-list.tsx` → `src/components/automations/review-list.tsx`
- Modify: `src/app/(workspace)/inbox/follow-ups/page.tsx` (becomes `redirect("/automations/review")`), `src/lib/follow-ups.ts` (labels/order from the registry; new kinds), `src/lib/follow-ups-data.ts` (list excludes drafts whose `sendAfter` is in the future), `src/components/inbox/inbox-workspace.tsx` (drop the Follow-ups link), notifications/dashboard links, `src/components/settings/settings-workspace.tsx` + `src/lib/settings.ts` + `src/app/(workspace)/settings/actions.ts` (remove Reminders and Workflows sections and their save paths), `src/components/layout/app-shell.tsx` (`?settings=reminders|workflows` → `router.replace("/automations")`)
- Test: move/adjust `follow-ups.test.ts`, `follow-ups/actions.test.ts`, `save-settings.test.ts`

- [ ] **Step 1: Failing tests:** `buildFollowUpsViewFromRecords` labels a `MISSED_VISIT` draft "Missed visit"; a draft with future `sendAfter` is not listed; settings save no longer accepts/writes `reminders`/`workflows` payloads (update `save-settings.test.ts` expectations).
- [ ] **Step 2–4:** fail → implement → pass. `rg "inbox/follow-ups"` returns only the redirect page. Commit; PR "Automations page" after the review loop; verify on the Vercel preview (owner signs in).

## Part D — New event automations (PR 4)

Shared helper (Task 10 creates it): `src/lib/automation-events.ts`
- `queueAutomationDraft(args: { businessId; clientId; appointmentId?; followUpReminderId?; kind: FollowUpDraftKind; dedupeKey: string; values; variant?; sendAfter?: Date }): Promise<string | null>` — reads settings, returns null if the automation is off/unavailable or WhatsApp isn't enabled; renders the body; creates the draft with `autoSend = mode === "AUTOMATIC"`; swallows P2002 (already queued).
- `dispatchSoon(draftId, businessId)` — `after(() => dispatchFollowUpDraft(...))` when `autoSend`.
- `suppressOpenReminderWindows(appointmentId, now)` — upserts SENT `AppointmentReminder` rows for FIRST/SECOND (and HIGH_RISK) whose window is already open for that visit (Review Focus 1). Called right after a confirmation/welcome/moved draft is dispatched successfully.

### Task 10: Booking confirmation and New patient welcome

**Files:** Create `src/lib/automation-events.ts` (+ test); Modify `src/app/(workspace)/calendar/actions.ts` (create path, after commit).
- [ ] **Step 1: Failing tests:** first-ever booking → kind `NEW_PATIENT_WELCOME`, not `BOOKING_CONFIRMATION`; client with a prior non-cancelled visit → `BOOKING_CONFIRMATION`; booking in the past → nothing; a Pro booking 30 min ahead, after dispatch → `suppressOpenReminderWindows` writes SENT for TWENTY_FOUR_HOUR and TWO_HOUR (Review Focus 1); Basic → nothing queued.
- [ ] **Step 2–4:** fail → implement → pass. Commit.

### Task 11: Visit moved or cancelled

**Files:** Modify `src/app/(workspace)/calendar/actions.ts` (edit: when `startAt` changes on a future visit; status → CANCELLED), `src/lib/appointments-shared.ts` (`cancelAppointmentCore` gains `notifyPatient: boolean`; true from calendar/client-detail/mobile staff cancel, **false** from `lib/messaging/inbound.ts`), `src/lib/mobile/appointments.ts`.
- dedupeKey `changed:<appointmentId>:<reminderGeneration>`; before queuing, dismiss any PENDING `VISIT_CHANGED` draft for the same appointment.
- [ ] **Step 1: Failing tests:** time change → `VISIT_CHANGED` "moved" body with the new date/time; clinic cancel → "cancelled" body; inbound reply cancel → no draft (Review Focus 5); notes-only edit → nothing; two quick moves → one pending draft (the newer).
- [ ] **Step 2–4:** fail → implement → pass. Commit.

### Task 12: Missed visit

**Files:** Modify `src/lib/appointments-shared.ts` (`recordAppointmentAttendanceCore`: NO_SHOW → queue with `sendAfter = now + timing hours`; attended (undo) → dismiss pending MISSED_VISIT for that appointment).
- [ ] **Step 1: Failing tests:** marking no-show queues one draft with `sendAfter` = +1h by default; undo dismisses it; Basic → nothing.
- [ ] **Step 2–4:** fail → implement → pass. Commit.

### Task 13: Check-up due

**Files:** Modify `src/lib/follow-up-generation.ts` (new candidate pass), `src/lib/workflow-generators.ts` (`findCheckupDueCandidates({ businessId, now })`: `ClientFollowUpReminder` with status "Scheduled", `remindAt` in `[now − 24h, now]`, client eligible (`INELIGIBLE_CLIENT_WHERE`), no future non-cancelled visit, no existing draft with `followUpReminderId`… dedupeKey `checkup:<id>`).
- [ ] **Step 1: Failing tests:** reminder due 2h ago → candidate; due 3 days ago → not (no retro burst); client with a future visit → not; already drafted → not.
- [ ] **Step 2–4:** fail → implement → pass. Commit; PR "New automations" after the review loop; end-to-end check on prod with the owner's own test patient only (Filan), WhatsApp connected, every other upcoming visit verified first.

## Part E — Activity and docs (PR 5)

### Task 14: Activity tab

**Files:** Create `src/app/(workspace)/automations/activity/page.tsx`, `src/lib/automation-activity.ts` (`listAutomationActivity({ businessId, kind?, page }): Promise<{ rows: { id; kind; label; clientId; clientName; sentAt; status: "Sent" | "Delivered" | "Read" | "Failed" }[]; counts: Partial<Record<AutomationKind, number>>; hasMore: boolean }>` — `Message` OUTBOUND with `automationKind` not null, last 30 days, 50 per page, URL-backed `?kind=&page=`), `src/components/automations/activity-list.tsx`.
- [ ] **Step 1: Failing tests:** rows newest first; `kind` filter; counts only include kinds with sends; messages without `automationKind` excluded; other businesses excluded.
- [ ] **Step 2–4:** fail → implement → pass. Commit.

### Task 15: Docs

**Files:** Modify `AGENTS.md` (new "Automations" Page Direction section; Settings section drops Reminders/Workflows; Inbox section drops Follow-ups; Plans section: Basic = first reminder + thank-you; Messaging rules: drafts in review mode never send themselves, automatic mode is the clinic's choice), `CLAUDE.md` (data model + cron lines), `PROJECT_STATUS.md`.
- [ ] Commit; PR "Automations activity and docs" after the review loop.
