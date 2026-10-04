# Follow-ups Page + Confirm-by-Reply Implementation Plan (PR 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shared "Follow-ups" drafted-message list (empty until PR 4/5 populate it) and the confirm-by-reply workflow: a patient who replies "1" to a reminder gets confirmed, "2" gets cancelled — automatically, safely, and only when unambiguous.

**Architecture:** One new model, `FollowUpDraft`, holds every kind of drafted outbound message (only `Follow-ups page` UI ships now; PR 4 and PR 5 are the producers). A new CAS helper `confirmAppointmentCore` mirrors the existing `cancelAppointmentCore`/`recordAppointmentAttendanceCore` pattern. A pure classifier (`classifyReplyIntent`) reads an inbound message body for an exact "1"/"yes"/"confirm" or "2"/"cancel" match; a new `applyInboundReplyIntent` function finds the patient's one unambiguous reminded appointment and acts, called from the WhatsApp webhook right after the message is recorded.

**Tech Stack:** Next.js 16 App Router (server actions), React 19, Prisma 6 + Postgres, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-22-no-show-and-workflows-design.md` (components 3 and 5). Builds on PR 1 (`docs/superpowers/plans/2026-09-22-no-show-status.md`) and PR 2 (`docs/superpowers/plans/2026-09-22-no-show-risk-score.md`), both already implemented in this worktree, uncommitted.

## Deviations from the spec (documented, not asked)

1. **No Albanian/common-equivalent reply tokens yet.** The spec says "1/yes/confirm (and Albanian/common equivalents, configurable list)". Fabricating Albanian phrasing without the owner's review risks silently misclassifying a real patient reply — worse than under-recognizing it. This PR ships the English tokens only (`1`, `yes`, `confirm` / `2`, `cancel`) as a `Set` the owner can extend later; a code comment flags the gap explicitly. This is safer than guessing.
2. **No `WorkflowSettings` model in this PR.** The spec puts every workflow's on/off switch and timing on one new `WorkflowSettings` row, "defaults on for Basic workflows". Confirm-by-reply has no timing to configure and no Pro/Basic split (it's on for every plan, same as reminders themselves today), so a whole new settings model for a single always-on feature would be unused infrastructure until PR 5 actually needs per-workflow toggles for rebook/payment/thank-you timing. `WorkflowSettings` is deferred to PR 5, where it has real fields to hold. Confirm-by-reply ships unconditionally on, matching how reminders themselves already have no explicit "reminders enabled" toggle beyond `business.whatsappEnabled`.
3. **`FollowUpDraft.waitlistEntryId` is not added in this PR.** The spec's field exists to link a `SLOT_OFFER` draft to its `WaitlistEntry`, but `WaitlistEntry` doesn't exist until PR 4. Adding a nullable column with nothing to reference yet is exactly the kind of unused-field debt CLAUDE.md's "don't build for hypothetical future requirements" rule warns against. PR 4 adds it via its own additive migration when it's actually needed.
4. **The Follow-ups page's row "reason" text is derived from `kind` + the linked appointment, not a stored field.** The spec's mockup example ("Cancelled slot, Thu 10:00") needs per-kind context that only the future generators (PR 4/5) can supply richly; for now every kind gets a plain, honest label ("Slot offer", "Rebooking nudge", etc.) plus the linked appointment's date/time when one exists. PR 4/5 can write more specific text directly into `body` without a schema change.

## Global Constraints

- `isProBusinessPlan()` gates nothing in this PR — every piece shipped here (Follow-ups page, confirm-by-reply) is available on every plan, same as reminders today. (spec's plan table: confirm-by-reply is a "Basic" — i.e., not Pro-exclusive — workflow)
- Server actions live in `actions.ts` beside their route, return typed result objects, validate with Zod where user input crosses the boundary. (CLAUDE.md)
- No patient names/diagnoses in logs or errors — log ids only. Every outbound message stays minimum-necessary: name + appointment time only, never service/clinical text. (CLAUDE.md, AGENTS.md)
- Revalidate every surface a mutation feeds. A reply-triggered cancel touches the same surfaces as a staff-triggered cancel — reuse `revalidateCalendarSurfaces`. (CLAUDE.md)
- Customer-facing copy hides providers; no raw errors surfaced to the UI. (CLAUDE.md)
- CAS discipline: every status flip (`FollowUpDraft` PENDING→SENT, `Appointment` →CONFIRMED) is a guarded `updateMany` keyed on the expected prior state, never a read-then-write — matches `cancelAppointmentCore`/`recordAppointmentAttendanceCore` exactly.
- The reply reader only acts on an **exact, unambiguous** match: exact normalized token, and exactly one candidate appointment. Anything else is left untouched as an ordinary inbound message — this is a safety property, not a nice-to-have, and must never be loosened to a substring/fuzzy match.
- Working tree is CRLF, git blobs are LF (`autocrlf=true`); use the Edit tool, not shell text replacement.
- **No git commits** — same as PR 1/2 (owner reviews everything locally first). Snapshot each task with `.superpowers/sdd/2026-09-22-follow-ups/snap.sh` (create it, copy PR 1's `snap.sh` verbatim — same tracked paths already cover `prisma`/`src`/`docs`/`AGENTS.md`/`PROJECT_STATUS.md`).
- Gates after every task: the touched test files, then `npx tsc --noEmit && npm run lint` before moving on. Task 6 runs the full suite.
- **Schema change needs the owner's explicit go-ahead before it's applied to the shared database** (Task 0) — everything else can be written and unit-tested without it.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | modify | `FollowUpDraft` model, `FollowUpDraftKind`/`FollowUpDraftStatus` enums, back-relations on `Business`/`Client`/`Appointment` |
| `prisma/follow-up-draft-migration.sql` | create | additive: new enums + new table, no existing row touched |
| `src/lib/follow-ups.ts` | create | view-model builder: `buildFollowUpsViewFromRecords` |
| `src/lib/follow-ups.test.ts` | create | builder unit tests |
| `src/lib/follow-ups-data.ts` | create | Prisma reads/writes: list pending, atomic send-flip, dismiss |
| `src/lib/follow-ups-data.test.ts` | create | mocked-Prisma tests |
| `src/app/(workspace)/inbox/follow-ups/page.tsx` | create | the page |
| `src/app/(workspace)/inbox/follow-ups/actions.ts` | create | `sendFollowUpDraftAction`, `dismissFollowUpDraftAction` |
| `src/app/(workspace)/inbox/follow-ups/actions.test.ts` | create | action tests |
| `src/components/inbox/follow-ups-list.tsx` | create | the row list UI |
| `src/components/inbox/inbox-workspace.tsx` | modify | header entry point + pending-count badge |
| `src/app/(workspace)/inbox/page.tsx` | modify | fetch + pass the pending count |
| `src/lib/appointments-shared.ts` | modify | `confirmAppointmentCore` |
| `src/lib/appointments-shared.test.ts` | modify | tests for it |
| `src/lib/reply-intent.ts` | create | pure `classifyReplyIntent` |
| `src/lib/reply-intent.test.ts` | create | tests |
| `src/lib/messaging/inbound.ts` | modify | `RecordInboundResult` gains `clientId`; new `applyInboundReplyIntent` |
| `src/lib/messaging/inbound.test.ts` | modify | tests for the reply path |
| `src/app/api/webhooks/whatsapp/baileys/route.ts` | modify | call `applyInboundReplyIntent` after a successful record |
| `src/lib/messaging/render.ts`, `src/lib/settings.ts` | modify | reminder template wording (both copies — see Global Constraints and Task 6) |
| `AGENTS.md`, `PROJECT_STATUS.md` | modify | copy/docs (Task 6) |

---

### Task 0: Get the database go-ahead (no code)

**Deliverable:** the owner's explicit yes to one additive schema change on the shared database. Everything else in this plan can be written and unit-tested without it; only the eventual browser QA and any live send needs it.

- [ ] **Step 1: Ask the owner**

Say exactly: "PR 3 needs one additive schema change: a new `FollowUpDraft` table plus two new enum types (`FollowUpDraftKind`, `FollowUpDraftStatus`). It's a brand-new table — nothing existing is altered, and (unlike PR 1's `ALTER TYPE`) the whole migration is one ordinary transaction. Nothing reads or writes it until this code deploys. OK to run it?" Do not run any SQL until they answer yes.

- [ ] **Step 2: Record the deploy order**

Same as PR 1: apply the SQL before the code that reads/writes `FollowUpDraft` deploys (the confirm-by-reply path does not depend on this table at all — only the Follow-ups page, its actions, and the Inbox page's follow-ups count read/write it). **Correction (final whole-branch review, PR 3 fix round):** the Inbox page (`src/app/(workspace)/inbox/page.tsx`) also reads `FollowUpDraft` to show the pending follow-ups count, so a delayed migration is not scoped to the Follow-ups page alone. That read is now wrapped in a try/catch that degrades to a count of 0 on failure, so a missing table degrades the Inbox's follow-ups count to 0 instead of crashing the page — but it is no longer accurate to say a delayed migration "only breaks that one page".

---

### Task 1: Schema

**Files:** `prisma/schema.prisma`, `prisma/follow-up-draft-migration.sql`.

- [ ] **Step 1:** In `prisma/schema.prisma`, add two enums near `AppointmentStatus`:

```prisma
enum FollowUpDraftKind {
  SLOT_OFFER
  REBOOK
  PAYMENT
  THANK_YOU
}

enum FollowUpDraftStatus {
  PENDING
  SENT
  DISMISSED
  EXPIRED
}
```

- [ ] **Step 2:** Add the model near `Appointment`:

```prisma
model FollowUpDraft {
  id            String               @id @default(cuid())
  businessId    String
  business      Business             @relation(fields: [businessId], references: [id], onDelete: Cascade)
  clientId      String
  client        Client               @relation(fields: [clientId], references: [id], onDelete: Cascade)
  kind          FollowUpDraftKind
  body          String
  status        FollowUpDraftStatus  @default(PENDING)
  appointmentId String?
  appointment   Appointment?         @relation(fields: [appointmentId], references: [id], onDelete: SetNull)
  dedupeKey     String
  expiresAt     DateTime?
  sentAt        DateTime?
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  @@unique([businessId, dedupeKey])
  @@index([businessId, status, createdAt])
}
```

- [ ] **Step 3:** Add the back-relations: `followUpDrafts FollowUpDraft[]` on `Business`, on `Client`, and on `Appointment` (grep each model for where its other `[]` relation lines live — e.g. `Client.appointments Appointment[]` — and add the new line immediately after, matching existing formatting/alignment).

- [ ] **Step 4:** Create `prisma/follow-up-draft-migration.sql`:

```sql
-- Follow-up drafts (slot offers, rebooking nudges, payment reminders, thank-yous)
-- =============================================================================
-- Adds two new enum types and one new table. Fully additive: nothing existing
-- is altered, and — unlike the NO_SHOW status migration — this is a normal
-- CREATE-only change, safe inside one transaction. Nothing in the running app
-- reads or writes this table until the Follow-ups page code deploys; the
-- confirm-by-reply workflow does not depend on this table at all.
CREATE TYPE "FollowUpDraftKind" AS ENUM ('SLOT_OFFER', 'REBOOK', 'PAYMENT', 'THANK_YOU');
CREATE TYPE "FollowUpDraftStatus" AS ENUM ('PENDING', 'SENT', 'DISMISSED', 'EXPIRED');

CREATE TABLE "FollowUpDraft" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "FollowUpDraftKind" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "FollowUpDraftStatus" NOT NULL DEFAULT 'PENDING',
    "appointmentId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FollowUpDraft_businessId_dedupeKey_key" ON "FollowUpDraft"("businessId", "dedupeKey");
CREATE INDEX "FollowUpDraft_businessId_status_createdAt_idx" ON "FollowUpDraft"("businessId", "status", "createdAt");

ALTER TABLE "FollowUpDraft" ADD CONSTRAINT "FollowUpDraft_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpDraft" ADD CONSTRAINT "FollowUpDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpDraft" ADD CONSTRAINT "FollowUpDraft_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5:** Run `npx prisma generate` (types only, no DB touch). Expected: "Generated Prisma Client".

- [ ] **Step 6:** Run `npx tsc --noEmit`. Expected: clean (nothing references the new model yet, so this just confirms the schema itself parses).

- [ ] **Step 7: Snapshot.**

---

### Task 2: `FollowUpDraft` data layer + view-model builder

**Files:** `src/lib/follow-ups.ts`, `src/lib/follow-ups.test.ts`, `src/lib/follow-ups-data.ts`, `src/lib/follow-ups-data.test.ts`.

**Interfaces:**
- Produces: `FollowUpDraftKind`, `FollowUpDraftItem = { id; clientId; clientName; kind; kindLabel; body; reasonLabel; createdLabel }`, `buildFollowUpsViewFromRecords(args): { items: FollowUpDraftItem[]; pendingCount: number }`; `listPendingFollowUpDrafts(businessId): Promise<FollowUpDraftRecord[]>`; `getPendingFollowUpDraftCount(businessId): Promise<number>`; `markFollowUpDraftSent(args): Promise<{ok:true}|{ok:false; error:string}>`; `dismissFollowUpDraft(args): Promise<{ok:true}|{ok:false; error:string}>`.

- [ ] **Step 1: Write the failing builder test**

Create `src/lib/follow-ups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFollowUpsViewFromRecords } from "@/lib/follow-ups";

function draft(overrides: Partial<Parameters<typeof buildFollowUpsViewFromRecords>[0]["drafts"][number]> = {}) {
  return {
    id: "draft_1",
    clientId: "client_1",
    client: { id: "client_1", name: "Alex Patient" },
    kind: "REBOOK" as const,
    body: "Hi Alex, it's been a while — want to book your next visit?",
    appointment: null,
    createdAt: new Date("2026-07-01T10:00:00Z"),
    ...overrides,
  };
}

describe("buildFollowUpsViewFromRecords", () => {
  it("labels each kind and falls back the reason to the kind label with no linked appointment", () => {
    const view = buildFollowUpsViewFromRecords({ drafts: [draft()], now: new Date("2026-07-02T00:00:00Z"), timeZone: "UTC" });
    expect(view.pendingCount).toBe(1);
    expect(view.items[0]).toMatchObject({
      id: "draft_1",
      clientName: "Alex Patient",
      kind: "REBOOK",
      kindLabel: "Rebooking nudge",
      reasonLabel: "Rebooking nudge",
    });
  });

  it("uses the linked appointment's service and time as the reason when one exists", () => {
    const withAppt = draft({
      kind: "SLOT_OFFER",
      appointment: { startAt: new Date("2026-07-10T09:00:00Z"), title: "Checkup" },
    });
    const view = buildFollowUpsViewFromRecords({ drafts: [withAppt], timeZone: "UTC" });
    expect(view.items[0]?.reasonLabel).toContain("Checkup");
  });

  it("returns an empty view for no drafts", () => {
    expect(buildFollowUpsViewFromRecords({ drafts: [] })).toEqual({ items: [], pendingCount: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/follow-ups.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the builder**

Create `src/lib/follow-ups.ts`:

```ts
import { formatZonedShortDate, formatZonedTime, getAppTimeZone } from "@/lib/time-zone";

export type FollowUpDraftKind = "SLOT_OFFER" | "REBOOK" | "PAYMENT" | "THANK_YOU";

export type FollowUpDraftItem = {
  id: string;
  clientId: string;
  clientName: string;
  kind: FollowUpDraftKind;
  kindLabel: string;
  body: string;
  reasonLabel: string;
  createdLabel: string;
};

const KIND_LABELS: Record<FollowUpDraftKind, string> = {
  SLOT_OFFER: "Slot offer",
  REBOOK: "Rebooking nudge",
  PAYMENT: "Payment reminder",
  THANK_YOU: "Thank-you message",
};

export type FollowUpDraftRecord = {
  id: string;
  clientId: string;
  client: { name: string };
  kind: FollowUpDraftKind;
  body: string;
  appointment: { startAt: Date; title: string } | null;
  createdAt: Date;
};

/**
 * Every kind gets an honest, generic reason label; when a linked appointment
 * exists (set by a future generator — PR 4/5), the reason names it instead.
 * See this plan's Deviation 4 for why the reason isn't a stored field.
 */
export function buildFollowUpsViewFromRecords(args: {
  drafts: FollowUpDraftRecord[];
  now?: Date;
  timeZone?: string;
}): { items: FollowUpDraftItem[]; pendingCount: number } {
  const { drafts, timeZone = getAppTimeZone() } = args;

  const items = drafts.map((draft) => ({
    id: draft.id,
    clientId: draft.clientId,
    clientName: draft.client.name,
    kind: draft.kind,
    kindLabel: KIND_LABELS[draft.kind],
    body: draft.body,
    reasonLabel: draft.appointment
      ? `${draft.appointment.title} · ${formatZonedShortDate(draft.appointment.startAt, timeZone)} ${formatZonedTime(draft.appointment.startAt, timeZone)}`
      : KIND_LABELS[draft.kind],
    createdLabel: formatZonedShortDate(draft.createdAt, timeZone),
  }));

  return { items, pendingCount: items.length };
}
```

(Verify `formatZonedShortDate`/`formatZonedTime`/`getAppTimeZone` exact signatures in `src/lib/time-zone.ts` before use — they're already used elsewhere in this codebase with this exact shape, e.g. `src/lib/dashboard.ts`.)

- [ ] **Step 4: Write the failing data-layer tests**

Create `src/lib/follow-ups-data.test.ts`. Mirror `src/lib/appointments-shared.test.ts`'s exact `vi.mock("@/lib/prisma", ...)` shape (read that file first, don't invent a new pattern):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  followUpDraft: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import { dismissFollowUpDraft, getPendingFollowUpDraftCount, listPendingFollowUpDrafts, markFollowUpDraftSent } from "@/lib/follow-ups-data";

beforeEach(() => vi.clearAllMocks());

describe("follow-ups data layer", () => {
  it("counts and lists only PENDING drafts scoped to the business", async () => {
    mocks.followUpDraft.count.mockResolvedValue(3);
    await getPendingFollowUpDraftCount("biz_1");
    expect(mocks.followUpDraft.count).toHaveBeenCalledWith({ where: { businessId: "biz_1", status: "PENDING" } });

    mocks.followUpDraft.findMany.mockResolvedValue([]);
    await listPendingFollowUpDrafts("biz_1");
    expect(mocks.followUpDraft.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: "biz_1", status: "PENDING" } })
    );
  });

  it("flips PENDING to SENT atomically and reports a plain error if it was already handled", async () => {
    mocks.followUpDraft.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await markFollowUpDraftSent({ id: "d1", businessId: "biz_1" })).toEqual({ ok: true });
    expect(mocks.followUpDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1", businessId: "biz_1", status: "PENDING" } })
    );

    mocks.followUpDraft.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await markFollowUpDraftSent({ id: "d1", businessId: "biz_1" })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });

  it("dismisses the same way", async () => {
    mocks.followUpDraft.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1" })).toEqual({ ok: true });

    mocks.followUpDraft.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await dismissFollowUpDraft({ id: "d1", businessId: "biz_1" })).toEqual({
      ok: false,
      error: "This follow-up was already handled.",
    });
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run src/lib/follow-ups-data.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 6: Implement**

Create `src/lib/follow-ups-data.ts`:

```ts
import { prisma } from "@/lib/prisma";
import type { FollowUpDraftRecord } from "@/lib/follow-ups";

export async function getPendingFollowUpDraftCount(businessId: string): Promise<number> {
  return prisma.followUpDraft.count({ where: { businessId, status: "PENDING" } });
}

export async function listPendingFollowUpDrafts(businessId: string): Promise<FollowUpDraftRecord[]> {
  return prisma.followUpDraft.findMany({
    where: { businessId, status: "PENDING" },
    include: {
      client: { select: { name: true } },
      appointment: { select: { startAt: true, title: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

type DraftMutationResult = { ok: true } | { ok: false; error: string };

const ALREADY_HANDLED_ERROR = "This follow-up was already handled.";

/** Atomic PENDING -> SENT flip: two staff tapping Send at once can't both succeed. */
export async function markFollowUpDraftSent(args: {
  id: string;
  businessId: string;
  now?: Date;
}): Promise<DraftMutationResult> {
  const { id, businessId, now = new Date() } = args;
  const { count } = await prisma.followUpDraft.updateMany({
    where: { id, businessId, status: "PENDING" },
    data: { status: "SENT", sentAt: now },
  });
  return count === 0 ? { ok: false, error: ALREADY_HANDLED_ERROR } : { ok: true };
}

/** Reverts a SENT draft back to PENDING — used when the send itself fails, so it can be retried. */
export async function revertFollowUpDraftToPending(args: { id: string; businessId: string }): Promise<void> {
  await prisma.followUpDraft.updateMany({
    where: { id: args.id, businessId: args.businessId, status: "SENT" },
    data: { status: "PENDING", sentAt: null },
  });
}

export async function dismissFollowUpDraft(args: { id: string; businessId: string }): Promise<DraftMutationResult> {
  const { count } = await prisma.followUpDraft.updateMany({
    where: { id: args.id, businessId: args.businessId, status: "PENDING" },
    data: { status: "DISMISSED" },
  });
  return count === 0 ? { ok: false, error: ALREADY_HANDLED_ERROR } : { ok: true };
}
```

- [ ] **Step 7: Run tests, type-check**

Run: `npx vitest run src/lib/follow-ups.test.ts src/lib/follow-ups-data.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Snapshot.**

---

### Task 3: The Follow-ups page, its actions, and the Inbox entry point

**Files:**
- Create: `src/app/(workspace)/inbox/follow-ups/page.tsx`, `src/app/(workspace)/inbox/follow-ups/actions.ts`, `src/app/(workspace)/inbox/follow-ups/actions.test.ts`, `src/components/inbox/follow-ups-list.tsx`
- Modify: `src/components/inbox/inbox-workspace.tsx`, `src/app/(workspace)/inbox/page.tsx`

**Interfaces:**
- Consumes: `buildFollowUpsViewFromRecords`/`listPendingFollowUpDrafts`/`getPendingFollowUpDraftCount`/`markFollowUpDraftSent`/`revertFollowUpDraftToPending`/`dismissFollowUpDraft` (Task 2); `sendMessage` (`@/lib/messaging`); the `getAuthedBusiness` helper this codebase already uses for inbox/calendar actions (grep its import in `src/app/(workspace)/inbox/actions.ts` and reuse the same import path — do not re-implement auth here).
- Produces: `sendFollowUpDraftAction(draftId: string): Promise<{ ok: boolean; error?: string }>`; `dismissFollowUpDraftAction(draftId: string): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Write the failing action tests**

First read `src/app/(workspace)/inbox/actions.test.ts` to copy its exact mocking shape for `getAuthedBusiness` and `@/lib/prisma` (client phone lookups, etc. all follow that file's pattern — don't invent a new one). Create `src/app/(workspace)/inbox/follow-ups/actions.test.ts` with cases for:

```ts
// Shape to follow (adapt mocks to match inbox/actions.test.ts's real setup):
// - "sends successfully": markFollowUpDraftSent returns ok, prisma finds the draft
//   with a client phone, sendMessage resolves { ok: true, ... }; assert
//   revalidatePath was called for "/inbox/follow-ups" and "/inbox", and the
//   action returns { ok: true }.
// - "the draft was already handled": markFollowUpDraftSent returns
//   { ok: false, error }; assert sendMessage is never called and the action
//   returns that same error without reverting anything (nothing to revert —
//   the flip never happened).
// - "the client has no phone on file": after a successful flip, the draft's
//   client.phone is null; assert the draft is reverted to PENDING
//   (revertFollowUpDraftToPending called) and a plain "no phone number"
//   error is returned.
// - "sendMessage fails": after a successful flip, sendMessage resolves
//   { ok: false, reason, error }; assert the draft is reverted to PENDING
//   and a plain "Couldn't send this message. Try again." error is returned
//   (never the raw provider error/reason — CLAUDE.md: hide providers).
// - "dismiss": mirrors markFollowUpDraftSent's already-handled case, no
//   sendMessage call at all.
```

Write the actual test bodies now, following the exact mock style you found in `inbox/actions.test.ts` — do not leave this as a comment in the real file, this block above is guidance for what to cover, not code to paste in.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/(workspace)/inbox/follow-ups/actions.test.ts"`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the actions**

Create `src/app/(workspace)/inbox/follow-ups/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/messaging";
import {
  dismissFollowUpDraft,
  markFollowUpDraftSent,
  revertFollowUpDraftToPending,
} from "@/lib/follow-ups-data";
// Use this codebase's existing inbox/calendar auth helper — match the exact
// import already used in src/app/(workspace)/inbox/actions.ts.
// import { getAuthedBusiness } from "...";

export type FollowUpDraftActionResult = { ok: boolean; error?: string };

export async function sendFollowUpDraftAction(draftId: string): Promise<FollowUpDraftActionResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const business = context.business;

  const flip = await markFollowUpDraftSent({ id: draftId, businessId: business.id });

  if (!flip.ok) {
    return { ok: false, error: flip.error };
  }

  const draft = await prisma.followUpDraft.findFirst({
    where: { id: draftId, businessId: business.id },
    select: { id: true, body: true, client: { select: { phone: true } } },
  });

  if (!draft?.client.phone) {
    await revertFollowUpDraftToPending({ id: draftId, businessId: business.id });
    return { ok: false, error: "This client has no phone number on file." };
  }

  const result = await sendMessage({
    channel: "WHATSAPP",
    businessId: business.id,
    to: draft.client.phone,
    message: { kind: "freeform", body: draft.body },
  });

  if (!result.ok) {
    await revertFollowUpDraftToPending({ id: draftId, businessId: business.id });
    return { ok: false, error: "Couldn't send this message. Try again." };
  }

  revalidatePath("/inbox/follow-ups");
  revalidatePath("/inbox");
  return { ok: true };
}

export async function dismissFollowUpDraftAction(draftId: string): Promise<FollowUpDraftActionResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const outcome = await dismissFollowUpDraft({ id: draftId, businessId: context.business.id });

  if (!outcome.ok) {
    return outcome;
  }

  revalidatePath("/inbox/follow-ups");
  revalidatePath("/inbox");
  return { ok: true };
}
```

Fill in the real `getAuthedBusiness` import path once you've located it — do not leave the placeholder comment in the final file.

- [ ] **Step 4: Run tests, type-check**

Run: `npx vitest run "src/app/(workspace)/inbox/follow-ups/actions.test.ts"`
Expected: PASS.

- [ ] **Step 5: Build the page and list component**

Create `src/components/inbox/follow-ups-list.tsx` — a client component, one row per `FollowUpDraftItem` (Task 2's type): client name, `kindLabel`, `body` (editable in a plain `<textarea>` before sending — the spec requires this; keep local edited-body state per row, and pass the edited text to `sendFollowUpDraftAction` — **note this means `sendFollowUpDraftAction` needs an optional edited-body override param**; go back and add `body?: string` as a second argument, using it in place of `draft.body` when present, before finalizing Task 3), `reasonLabel`, and two buttons — Send / Skip — calling the two actions, with the same busy/error-handling shape already established in `src/components/calendar/calendar-workspace.tsx`'s `AppointmentQuickView` (`busy` state, inline error text, no `form.requestSubmit()` — see the codebase's `browser-qa-testing-quirks` lesson: that pattern breaks server-action forms). Use the shared `WorkspaceEmptyState` component (grep it in `src/components/workspace/`) for the empty-list case: "No follow-ups right now."

Create `src/app/(workspace)/inbox/follow-ups/page.tsx`:

```tsx
import { requireCurrentWorkspace } from "@/lib/business";
import { buildFollowUpsViewFromRecords } from "@/lib/follow-ups";
import { listPendingFollowUpDrafts } from "@/lib/follow-ups-data";
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace/workspace-layout";
import { FollowUpsList } from "@/components/inbox/follow-ups-list";

export default async function FollowUpsPage() {
  const { business } = await requireCurrentWorkspace("/inbox/follow-ups", {
    missingBusinessRedirect: "/onboarding",
  });

  const drafts = await listPendingFollowUpDrafts(business.id);
  const view = buildFollowUpsViewFromRecords({ drafts });

  return (
    <WorkspacePage size="wide">
      <WorkspaceHeader title="Follow-ups" backHref="/inbox" backLabel="Inbox" />
      <FollowUpsList items={view.items} />
    </WorkspacePage>
  );
}
```

(Confirm `WorkspaceHeader`'s actual `backHref`/`backLabel` prop names against `src/components/workspace/workspace-layout.tsx` before using them — they were reported as present but verify the exact prop names compile.)

- [ ] **Step 6: Wire the Inbox entry point**

In `src/app/(workspace)/inbox/page.tsx`, import `getPendingFollowUpDraftCount` and fetch it alongside the existing inbox data fetch; pass `followUpsCount={count}` into `<InboxWorkspace>`.

In `src/components/inbox/inbox-workspace.tsx`, add `followUpsCount: number` to props, and render a small link/tab next to the "Inbox" title or in the header's `actions` slot (mirror the existing `FilterChip` visual style used for "All"/"Unread" — a pill with a `Link href="/inbox/follow-ups"` and a count badge, rendered only when `followUpsCount > 0`? **No** — always render it, showing 0 when empty, so it's discoverable before any draft ever exists (this is a navigation entry point, not a filter — AGENTS.md's Inbox section has no room for a permanent zero-count element, so re-check that section before finalizing: if a persistent "Follow-ups (0)" link reads as clutter against AGENTS.md's "no filler" rule, gate it behind `followUpsCount > 0` instead and note this as a ruling in the ledger).

- [ ] **Step 7: Run all gates**

Run: `npx vitest run`
Expected: PASS (full suite — this task touches shared Inbox files).

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 8: Snapshot.**

---

### Task 4: `confirmAppointmentCore`

**Files:** `src/lib/appointments-shared.ts`, `src/lib/appointments-shared.test.ts`.

**Interfaces:**
- Produces: `confirmAppointmentCore(where: { id: string; businessId: string }): Promise<AppointmentMutationOutcome>` (reuses the existing `AppointmentMutationOutcome` type from `cancelAppointmentCore`/`recordAppointmentAttendanceCore`).

- [ ] **Step 1: Write the failing tests**

In `src/lib/appointments-shared.test.ts`, add `confirmAppointmentCore` to the import list and append (mirror the existing `recordAppointmentAttendanceCore` describe block's mocking style exactly):

```ts
describe("confirmAppointmentCore", () => {
  it("confirms a pending appointment", async () => {
    mockGuardHit();
    const result = await confirmAppointmentCore(WHERE);
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith({
      where: { ...WHERE, status: "PENDING" },
      data: { status: "CONFIRMED" },
    });
  });

  it("is a no-op success when already confirmed", async () => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });
    mocks.appointment.findFirst.mockResolvedValue({ ...RECORD, status: "CONFIRMED" });
    expect(await confirmAppointmentCore(WHERE)).toMatchObject({ ok: true, changed: false });
  });

  it("returns 404 for an appointment outside this workspace", async () => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });
    mocks.appointment.findFirst.mockResolvedValue(null);
    expect(await confirmAppointmentCore(WHERE)).toEqual({ ok: false, status: 404, error: APPOINTMENT_NOT_FOUND_ERROR });
  });

  it("reports a conflict for anything else (cancelled, completed, no-show)", async () => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });
    mocks.appointment.findFirst.mockResolvedValue({ ...RECORD, status: "CANCELLED" });
    expect(await confirmAppointmentCore(WHERE)).toEqual({ ok: false, status: 409, error: APPOINTMENT_CONFLICT_ERROR });
  });
});
```

(Adapt `WHERE`/`RECORD`/`mockGuardHit` to whatever this file's existing `cancelAppointmentCore`/`recordAppointmentAttendanceCore` tests already call their shared fixtures — match exactly, don't invent new names.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/appointments-shared.test.ts -t "confirmAppointmentCore"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

After `recordAppointmentAttendanceCore` in `src/lib/appointments-shared.ts`, add:

```ts
/**
 * Confirms a pending appointment via compare-and-set, same discipline as
 * cancelAppointmentCore/recordAppointmentAttendanceCore: the allowed source
 * state (PENDING) lives in the update's own WHERE clause. Used by the
 * confirm-by-reply workflow — see lib/messaging/inbound.ts.
 */
export async function confirmAppointmentCore(where: {
  id: string;
  businessId: string;
}): Promise<AppointmentMutationOutcome> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.appointment.updateMany({
      where: { ...where, status: "PENDING" },
      data: { status: "CONFIRMED" },
    });

    if (count === 0) {
      const existing = await tx.appointment.findFirst({
        where,
        select: { id: true, clientId: true, staffMemberId: true, status: true },
      });

      if (!existing) {
        return { ok: false, status: 404, error: APPOINTMENT_NOT_FOUND_ERROR };
      }

      if (existing.status === "CONFIRMED") {
        return {
          ok: true,
          appointmentId: existing.id,
          clientId: existing.clientId,
          staffMemberId: existing.staffMemberId,
          changed: false,
        };
      }

      return { ok: false, status: 409, error: APPOINTMENT_CONFLICT_ERROR };
    }

    const updated = await tx.appointment.findFirstOrThrow({
      where: { id: where.id },
      select: { id: true, clientId: true, staffMemberId: true },
    });

    return {
      ok: true,
      appointmentId: updated.id,
      clientId: updated.clientId,
      staffMemberId: updated.staffMemberId,
      changed: true,
    };
  });
}
```

- [ ] **Step 4: Run tests, type-check**

Run: `npx vitest run src/lib/appointments-shared.test.ts`
Expected: PASS (all cancel/attendance/confirm tests).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Snapshot.**

---

### Task 5: The reply classifier and the reply-driven mutation

**Files:**
- Create: `src/lib/reply-intent.ts`, `src/lib/reply-intent.test.ts`
- Modify: `src/lib/messaging/inbound.ts`, `src/lib/messaging/inbound.test.ts`
- Modify: `src/app/api/webhooks/whatsapp/baileys/route.ts`

**Interfaces:**
- Consumes: `confirmAppointmentCore`, `cancelAppointmentCore`, `notifyStaffOfAppointmentChange`, `revalidateCalendarSurfaces` (all `@/lib/appointments-shared`); `sendMessage` (`@/lib/messaging`); `formatZonedFullDate`, `formatZonedTime` (`@/lib/time-zone`).
- Produces: `classifyReplyIntent(rawBody: string): "confirm" | "cancel" | null`; `RecordInboundResult` gains `clientId: string | null` on the `recorded: true` branch; `applyInboundReplyIntent(args: { businessId: string; clientId: string | null; body: string; now?: Date }): Promise<ApplyReplyIntentResult>`.

- [ ] **Step 1: Write the failing classifier tests**

Create `src/lib/reply-intent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyReplyIntent } from "@/lib/reply-intent";

describe("classifyReplyIntent", () => {
  it.each(["1", "yes", "confirm", " Yes ", "CONFIRM"])("reads %j as confirm", (input) => {
    expect(classifyReplyIntent(input)).toBe("confirm");
  });

  it.each(["2", "cancel", " Cancel "])("reads %j as cancel", (input) => {
    expect(classifyReplyIntent(input)).toBe("cancel");
  });

  it.each(["", "1 please cancel", "maybe", "yes, but what time", "12", "yess"])(
    "treats %j as no intent — only an exact token counts",
    (input) => {
      expect(classifyReplyIntent(input)).toBeNull();
    }
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/reply-intent.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the classifier**

Create `src/lib/reply-intent.ts`:

```ts
export type ReplyIntent = "confirm" | "cancel" | null;

// English only for now — Albanian/common equivalents are deferred (this
// plan's Deviation 1): guessing translations without the owner's review
// risks silently misreading a real patient reply. Extend this list, don't
// replace the matching strategy, when real translations are supplied.
const CONFIRM_TOKENS = new Set(["1", "yes", "confirm"]);
const CANCEL_TOKENS = new Set(["2", "cancel"]);

/**
 * Reads an inbound message body for an exact confirm/cancel reply. Matches
 * only the whole normalized (trimmed, lowercased) body — never a substring —
 * so "1 please also cancel my other appointment" is correctly read as no
 * intent, not confirm. This is a safety property: a false match cancels or
 * confirms a real appointment with no human in the loop.
 */
export function classifyReplyIntent(rawBody: string): ReplyIntent {
  const normalized = rawBody.trim().toLowerCase();

  if (CONFIRM_TOKENS.has(normalized)) return "confirm";
  if (CANCEL_TOKENS.has(normalized)) return "cancel";
  return null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/reply-intent.test.ts`
Expected: PASS.

- [ ] **Step 5: Read `src/lib/messaging/inbound.ts` in full**, including its existing tests in `src/lib/messaging/inbound.test.ts`, before changing anything — this file has a P2002-race fallback and a monotonic delivery-status state machine that must not regress.

- [ ] **Step 6: Write the failing tests for the widened result and the new function**

In `src/lib/messaging/inbound.test.ts`:

1. Find the existing "records an inbound message" test(s) and add an assertion that a successful `recordInboundMessage` result now includes `clientId` (the resolved client's id, or `null` when no client matched by phone) — extend the existing test rather than duplicating it.
2. Append a new describe block:

```ts
describe("applyInboundReplyIntent", () => {
  const NOW = new Date("2026-07-01T12:00:00Z");
  const REMINDED_UPCOMING = {
    id: "appt_1",
    startAt: new Date("2026-07-02T09:00:00Z"),
    staffMemberId: "staff_1",
    client: { phone: "+38344123456" },
  };

  it("does nothing when the body has no intent", async () => {
    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "hello", now: NOW });
    expect(result).toEqual({ applied: false, reason: "no_intent" });
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });

  it("does nothing when the phone didn't match a client", async () => {
    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: null, body: "1", now: NOW });
    expect(result).toEqual({ applied: false, reason: "no_client" });
  });

  it("does nothing when there's no unambiguous match", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([]);
    expect(await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW })).toEqual({
      applied: false,
      reason: "no_match",
    });

    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING, { ...REMINDED_UPCOMING, id: "appt_2" }]);
    expect(await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW })).toEqual({
      applied: false,
      reason: "ambiguous",
    });
  });

  it("confirms the one unambiguous match and sends a confirmation", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.confirmAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "yes", now: NOW });

    expect(result).toEqual({ applied: true, intent: "confirm", appointmentId: "appt_1" });
    expect(mocks.confirmAppointmentCore).toHaveBeenCalledWith({ id: "appt_1", businessId: "biz_1" });
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: "WHATSAPP", to: "+38344123456" }));
  });

  it("cancels the one unambiguous match, sends a confirmation, and notifies staff", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.cancelAppointmentCore.mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", clientId: "client_1", staffMemberId: "staff_1", changed: true });

    const result = await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "2", now: NOW });

    expect(result).toEqual({ applied: true, intent: "cancel", appointmentId: "appt_1" });
    expect(mocks.notifyStaffOfAppointmentChange).toHaveBeenCalledWith("biz_1", "staff_1", "appt_1", "changed");
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(["client_1"], ["staff_1"]);
  });

  it("reports no_match instead of throwing when the guarded mutation itself found nothing to change", async () => {
    mocks.appointment.findMany.mockResolvedValueOnce([REMINDED_UPCOMING]);
    mocks.confirmAppointmentCore.mockResolvedValueOnce({ ok: false, status: 409, error: "conflict" });
    expect(await applyInboundReplyIntent({ businessId: "biz_1", clientId: "client_1", body: "1", now: NOW })).toEqual({
      applied: false,
      reason: "no_match",
    });
  });
});
```

Add `confirmAppointmentCore`, `cancelAppointmentCore`, `notifyStaffOfAppointmentChange`, `revalidateCalendarSurfaces` mocks to this file's `vi.mock("@/lib/appointments-shared", ...)` factory (create it if this file doesn't already mock that module), and a `sendMessage` mock for `@/lib/messaging`, following this file's existing mocking conventions.

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/lib/messaging/inbound.test.ts`
Expected: FAIL — `applyInboundReplyIntent` not exported, `clientId` missing from the result.

- [ ] **Step 8: Widen `recordInboundMessage`'s result and implement `applyInboundReplyIntent`**

In `src/lib/messaging/inbound.ts`:

1. Change `RecordInboundResult`'s success branch to `{ recorded: true; conversationId: string; clientId: string | null }`.
2. At the `return { recorded: true, conversationId }` line(s) (there may be more than one return path — the fast-path duplicate-provider-message-id check returns early with `recorded:false`, so only the success path needs this), add `clientId: matchingClient?.id ?? null,`.
3. Add the imports: `confirmAppointmentCore`, `cancelAppointmentCore`, `notifyStaffOfAppointmentChange`, `revalidateCalendarSurfaces` from `@/lib/appointments-shared`; `sendMessage` from `./index` (or wherever this file already imports sibling messaging code from — check existing imports first); `formatZonedFullDate`, `formatZonedTime` from `@/lib/time-zone`; `classifyReplyIntent` from `@/lib/reply-intent`.
4. Append:

```ts
export type ApplyReplyIntentResult =
  | { applied: false; reason: "no_intent" | "no_client" | "no_match" | "ambiguous" }
  | { applied: true; intent: "confirm" | "cancel"; appointmentId: string };

/**
 * Reads an inbound message for a confirm/cancel reply and, only when exactly
 * one upcoming reminded appointment matches, acts on it. Called by the
 * webhook route right after recordInboundMessage succeeds — separate from it
 * so the message-recording path (already heavily tested, with its own P2002
 * race handling) stays unchanged in behavior and risk surface.
 */
export async function applyInboundReplyIntent(args: {
  businessId: string;
  clientId: string | null;
  body: string;
  now?: Date;
}): Promise<ApplyReplyIntentResult> {
  const { businessId, clientId, body, now = new Date() } = args;

  const intent = classifyReplyIntent(body);
  if (!intent) {
    return { applied: false, reason: "no_intent" };
  }
  if (!clientId) {
    return { applied: false, reason: "no_client" };
  }

  // Confirming only makes sense from PENDING; cancelling also allows an
  // already-CONFIRMED appointment (the far more common real case: a patient
  // was already confirmed but now needs to cancel).
  const candidateStatuses = intent === "confirm" ? (["PENDING"] as const) : (["PENDING", "CONFIRMED"] as const);

  const candidates = await prisma.appointment.findMany({
    where: {
      businessId,
      clientId,
      status: { in: candidateStatuses },
      startAt: { gt: now },
      reminders: { some: { status: "SENT" } },
    },
    select: { id: true, startAt: true, client: { select: { phone: true } } },
  });

  if (candidates.length !== 1) {
    return { applied: false, reason: candidates.length === 0 ? "no_match" : "ambiguous" };
  }

  const appointment = candidates[0];
  const phone = appointment.client.phone;

  if (intent === "confirm") {
    const outcome = await confirmAppointmentCore({ id: appointment.id, businessId });
    if (!outcome.ok || !outcome.changed) {
      return { applied: false, reason: "no_match" };
    }
    if (phone) {
      await sendMessage({
        channel: "WHATSAPP",
        businessId,
        to: phone,
        message: {
          kind: "freeform",
          body: `You're confirmed for ${formatZonedTime(appointment.startAt)} on ${formatZonedFullDate(appointment.startAt)}. See you then!`,
        },
      });
    }
    return { applied: true, intent: "confirm", appointmentId: appointment.id };
  }

  const outcome = await cancelAppointmentCore({ id: appointment.id, businessId });
  if (!outcome.ok || !outcome.changed) {
    return { applied: false, reason: "no_match" };
  }
  if (phone) {
    await sendMessage({
      channel: "WHATSAPP",
      businessId,
      to: phone,
      message: {
        kind: "freeform",
        body: `Your appointment on ${formatZonedFullDate(appointment.startAt)} at ${formatZonedTime(appointment.startAt)} has been cancelled.`,
      },
    });
  }
  if (outcome.staffMemberId) {
    await notifyStaffOfAppointmentChange(businessId, outcome.staffMemberId, appointment.id, "changed");
  }
  revalidateCalendarSurfaces([outcome.clientId], outcome.staffMemberId ? [outcome.staffMemberId] : []);

  return { applied: true, intent: "cancel", appointmentId: appointment.id };
}
```

- [ ] **Step 9: Run tests, type-check**

Run: `npx vitest run src/lib/messaging/inbound.test.ts src/lib/reply-intent.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 10: Wire the webhook route**

In `src/app/api/webhooks/whatsapp/baileys/route.ts`, after the existing `recordInboundMessage(...)` call succeeds (its `recorded: true` branch), call `applyInboundReplyIntent({ businessId, clientId: result.clientId, body: event.body })` — best-effort, wrapped so a failure here never breaks the webhook's own 200 response to the Baileys worker (the message is already safely recorded regardless). Do not await-block the response on this if the route has a response-time budget; if it already awaits `recordInboundMessage` synchronously before responding, awaiting this too is consistent and fine — match whatever timing discipline the route already has, don't introduce a new one.

- [ ] **Step 11: Run all gates**

Run: `npx vitest run`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 12: Snapshot.**

---

### Task 6: Reminder template wording, docs, and final gates

**Files:** `src/lib/messaging/render.ts`, `src/lib/settings.ts`, `AGENTS.md`, `PROJECT_STATUS.md`.

- [ ] **Step 1:** In `src/lib/messaging/render.ts`, change `DEFAULT_REMINDER_TEMPLATE`'s trailing sentence from `"Reply here if you need to reschedule."` to `"Reply 1 to confirm or 2 to cancel."` — the old wording is actively misleading now that a free-text reply does nothing structured. Update the file's doc comment above the constant if it references the old wording.
- [ ] **Step 2:** Make the identical change to `defaultReminderTemplate` in `src/lib/settings.ts` (same string, currently duplicated — CLAUDE.md's "fix the class, not the line": both copies must change together or the Settings page's shown default will silently disagree with what actually sends).
- [ ] **Step 3:** Grep the whole codebase for any other literal occurrence of "Reply here if you need to reschedule" (there were exactly two as of this plan being written — confirm that's still true; a third would mean this plan's research was stale) and update it too.
- [ ] **Step 4:** In `AGENTS.md`'s Messaging section, add one sentence noting reminders now carry a reply-driven confirm/cancel action (plain product language, no implementation detail — mirror the existing tone of that section).
- [ ] **Step 5:** In `PROJECT_STATUS.md`, add a bullet: Follow-ups page + confirm-by-reply built and unit-tested; the `FollowUpDraft` table exists but nothing populates it yet (PR 4/5); confirm-by-reply is live once the reminders code deploys (no schema dependency); browser QA not yet run.
- [ ] **Step 6: Full gates**

Run: `npx vitest run`
Expected: all pass, including every PR 1 and PR 2 test file (no regression).

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 7: Snapshot and final whole-branch review**

Snapshot, then run subagent-driven-development's final review for this plan (Tasks 1-6 together, diffed against Task 1's BASE snapshot) before moving to PR 4.
