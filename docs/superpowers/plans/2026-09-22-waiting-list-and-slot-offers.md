# Waiting List + Slot Offers Implementation Plan (PR 4 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a booked appointment is cancelled, automatically draft an offer of that freed slot to the best-matching patient on a staff-built waiting list — never auto-sent, never auto-booked.

**Architecture:** A new `WaitlistEntry` model (Pro) holds staff-entered preferences (service, optional provider, optional date/day/time window). A pure, unit-tested matcher (`findBestWaitlistMatch`) picks the single best candidate for a freed slot. `cancelAppointmentCore` — already the one CAS chokepoint used by the web action, the mobile API, and PR 3's reply-cancel path — gets one addition: on a real cancellation, run the matcher and, on a hit, write one `SLOT_OFFER` `FollowUpDraft` (from PR 3) inside the same transaction. The Follow-ups page (PR 3) gains a "Book" action for a sent slot offer, pre-filling New Appointment.

**Tech Stack:** Next.js 16 App Router (server actions), React 19, Prisma 6 + Postgres, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-22-no-show-and-workflows-design.md` (component 4). Builds on PR 1, PR 2 (both implemented, uncommitted, in this worktree) and PR 3 (`docs/superpowers/plans/2026-09-22-follow-ups-and-confirm-by-reply.md` — **must be implemented before this plan starts**; this plan's Task 1 assumes `FollowUpDraft` already exists).

## Deviations from the spec (documented, not asked)

1. **One entry point (Calendar), not two.** The spec says "Add to the waiting list from a client profile or the calendar" — an *or*, satisfied by either. Client Detail's header (3 fixed actions) and its five tabs are AGENTS.md-locked ("owner decision... do not re-add via review"); adding a fourth header action or a sixth tab there risks silently violating a locked decision that this plan's author can't get sign-off on mid-implementation. This PR ships the Calendar entry point only — a "Waiting list" button in the Calendar header opening a panel, matching the spec's "or". A client-profile shortcut can be added later once the owner confirms where it fits inside the locked structure.
2. **The Follow-ups page (PR 3) gets one small widening, not a new page.** PR 3 built `listPendingFollowUpDrafts` (status `PENDING` only) because nothing produced drafts yet. A slot offer needs one more step after Send: once staff sends the offer and the patient says yes (in ordinary WhatsApp conversation — replies aren't structured for this), staff must still see the offer to book it. This PR widens the Follow-ups query to also surface a `SENT` `SLOT_OFFER` draft whose linked waiting-list entry is still `OFFERED` (i.e., awaiting a booking), and adds a "Book" action beside Send/Skip that appears only for that case. This is additive to PR 3's page, not a redesign of it.
3. **Slot matching runs inside `cancelAppointmentCore`'s existing transaction**, not as a separate step after. The spec says the trigger is "the shared `cancelAppointmentCore`... enqueues slot-fill matching" — putting it in the same transaction (rather than a best-effort follow-up call) means a freed slot can never be recorded as cancelled without its matching draft (or lack of one) being decided atomically; there's no window where the cancel succeeded but the match silently never ran.
4. **Only one offer per cancellation, matching the spec exactly** ("Creates one SLOT_OFFER draft for the best match... Offers go out one at a time"). No task in this plan builds a "next match" trigger for when an offer is skipped/expires — the spec describes that as staff moving to the next match manually via the waiting list panel, not a second automated draft; re-triggering happens by staff re-running the match from the panel (Task 6), not by a background process.

## Global Constraints

- Waiting list, slot matching, and `SLOT_OFFER` drafts are **Pro only** — `isProBusinessPlan(business.plan)` gates the waiting-list UI, its server actions, and (inside `cancelAppointmentCore`) the matching step itself. A Basic workspace's cancel behaves exactly as it does today — no query, no draft, zero added cost. (spec's plan table: waiting list is Pro)
- CAS discipline throughout: `WaitlistEntry.status` transitions (`WAITING`→`OFFERED`, `OFFERED`→`FILLED`/back to `WAITING`) are guarded `updateMany`s keyed on the expected prior status, never read-then-write.
- No patient names/diagnoses in logs; minimum-necessary message content (name + time only) in any drafted body.
- `dedupeKey` uniqueness (`@@unique([businessId, dedupeKey])`, already on `FollowUpDraft` from PR 3) makes the matcher's draft-write idempotent — a retried transaction or a duplicate call can never create two drafts for the same freed slot + candidate pair.
- Working tree is CRLF, git blobs are LF (`autocrlf=true`); use the Edit tool, not shell text replacement.
- **No git commits** — same as PR 1-3. Snapshot each task with `.superpowers/sdd/2026-09-22-waiting-list/snap.sh` (create it, copy PR 1's `snap.sh` verbatim).
- Gates after every task: touched test files, then `npx tsc --noEmit && npm run lint`. Final task runs the full suite.
- **Schema change needs the owner's explicit go-ahead** (Task 0) before it's applied to the shared database.
- The `weekday` integer convention is **Monday=0…Sunday=6** everywhere in this codebase (`BusinessHours.weekday`, and the `(jsWeekday + 6) % 7` conversion used in `src/lib/calendar.ts` and `src/app/(workspace)/calendar/actions.ts`). `WaitlistEntry.preferredDays` and the matcher's `weekday` input MUST use this exact convention — never raw `Date.getDay()` (Sunday=0), which would silently shift every match by one day.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | modify | `WaitlistEntry` model, `WaitlistEntryStatus` enum, `FollowUpDraft.waitlistEntryId`, back-relations |
| `prisma/waitlist-migration.sql` | create | additive: new enum + new table + one new nullable column + FKs |
| `src/lib/slot-fill-matching.ts` | create | pure `findBestWaitlistMatch` |
| `src/lib/slot-fill-matching.test.ts` | create | unit tests |
| `src/lib/waitlist-data.ts` | create | CRUD + the matching query that feeds the pure function |
| `src/lib/waitlist-data.test.ts` | create | mocked-Prisma tests |
| `src/lib/appointments-shared.ts` | modify | `cancelAppointmentCore` gains the matching step |
| `src/lib/appointments-shared.test.ts` | modify | tests for the new behavior |
| `src/app/(workspace)/calendar/waitlist-actions.ts` | create | add/update/remove waiting-list entry server actions |
| `src/app/(workspace)/calendar/waitlist-actions.test.ts` | create | action tests |
| `src/components/calendar/waitlist-panel.tsx` | create | the Calendar-header entry point + list/add/edit/remove UI |
| `src/components/calendar/calendar-workspace.tsx` | modify | header button opening the panel (Pro only) |
| `src/app/(workspace)/calendar/page.tsx` | modify | pass waiting-list data + `isProBusinessPlan` down |
| `src/lib/follow-ups-data.ts` | modify | widen the Follow-ups query (Deviation 2) |
| `src/lib/follow-ups.ts` | modify | `FollowUpDraftItem` gains an optional "Book" affordance flag |
| `src/app/(workspace)/inbox/follow-ups/actions.ts` | modify | `bookFollowUpSlotAction` (marks the waitlist entry `FILLED`, returns the booking pre-fill URL) |
| `src/components/inbox/follow-ups-list.tsx` | modify | "Book" button, only for a sent slot offer |
| `src/app/(workspace)/calendar/new/page.tsx`, `src/components/calendar/new-appointment-form.tsx` | modify | `?service=`/`?staffMemberId=` pre-fill |
| `AGENTS.md`, `PROJECT_STATUS.md`, `src/lib/public-plans.ts` | modify | copy/docs (final task) |

---

### Task 0: Get the database go-ahead (no code)

- [ ] **Step 1: Ask the owner**

Say exactly: "PR 4 needs one additive schema change: a new `WaitlistEntry` table, a new `WaitlistEntryStatus` enum, and one new nullable column (`waitlistEntryId`) on the `FollowUpDraft` table PR 3 added. All additive — nothing existing is altered, one ordinary transaction. OK to run it?" Do not run any SQL until they answer yes.

- [ ] **Step 2: Record the deploy order.** Apply before this PR's code deploys — same reasoning as PR 1/3 (the code will start writing `WaitlistEntry`/the new column the moment it ships).

---

### Task 1: Schema

**Files:** `prisma/schema.prisma`, `prisma/waitlist-migration.sql`.

**Precondition:** confirm `FollowUpDraft` already exists in `prisma/schema.prisma` (PR 3). If it doesn't, STOP — this plan cannot proceed until PR 3 is implemented; do not improvise a `FollowUpDraft` model here.

- [ ] **Step 1:** Add the enum:

```prisma
enum WaitlistEntryStatus {
  WAITING
  OFFERED
  FILLED
  REMOVED
}
```

- [ ] **Step 2:** Add the model:

```prisma
model WaitlistEntry {
  id             String               @id @default(cuid())
  businessId     String
  business       Business             @relation(fields: [businessId], references: [id], onDelete: Cascade)
  clientId       String
  client         Client               @relation(fields: [clientId], references: [id], onDelete: Cascade)
  service        String
  staffMemberId  String?
  staffMember    StaffMember?         @relation(fields: [staffMemberId], references: [id], onDelete: SetNull)
  earliestDate   DateTime?
  preferredDays  Int[]                @default([])
  preferredFrom  String?
  preferredTo    String?
  notes          String?
  status         WaitlistEntryStatus  @default(WAITING)
  followUpDrafts FollowUpDraft[]
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  @@index([businessId, status])
  @@index([clientId])
  @@index([staffMemberId])
}
```

(`preferredDays: Int[]` — Postgres native array, fully supported by Prisma on this provider; several other models in this schema could be checked for precedent but none currently use an array column, so this will be the first — confirm `npx prisma generate` accepts it before moving on, and if it doesn't, fall back to a comma-joined `String` column and parse it in the data layer, noting that as a ruling.)

- [ ] **Step 3:** Add `waitlistEntryId`/`waitlistEntry` to the existing `FollowUpDraft` model (added by PR 3):

```prisma
  waitlistEntryId String?
  waitlistEntry   WaitlistEntry? @relation(fields: [waitlistEntryId], references: [id], onDelete: SetNull)
```

(Insert immediately after the existing `appointmentId`/`appointment` lines, matching that pair's formatting.)

- [ ] **Step 4:** Add back-relations: `waitlistEntries WaitlistEntry[]` on `Business`, `Client`, and `StaffMember` (grep each model for where its sibling `[]` relations live and match formatting).

- [ ] **Step 5:** Create `prisma/waitlist-migration.sql`:

```sql
-- Waiting list + slot offers
-- =============================================================================
-- Adds one new enum, one new table, and one new nullable column on the
-- FollowUpDraft table PR 3 added. Fully additive, one ordinary transaction —
-- nothing existing is altered or at risk. Nothing in the running app reads or
-- writes any of this until this PR's code deploys.
CREATE TYPE "WaitlistEntryStatus" AS ENUM ('WAITING', 'OFFERED', 'FILLED', 'REMOVED');

CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "staffMemberId" TEXT,
    "earliestDate" TIMESTAMP(3),
    "preferredDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "preferredFrom" TEXT,
    "preferredTo" TEXT,
    "notes" TEXT,
    "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaitlistEntry_businessId_status_idx" ON "WaitlistEntry"("businessId", "status");
CREATE INDEX "WaitlistEntry_clientId_idx" ON "WaitlistEntry"("clientId");
CREATE INDEX "WaitlistEntry_staffMemberId_idx" ON "WaitlistEntry"("staffMemberId");

ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FollowUpDraft" ADD COLUMN "waitlistEntryId" TEXT;
ALTER TABLE "FollowUpDraft" ADD CONSTRAINT "FollowUpDraft_waitlistEntryId_fkey" FOREIGN KEY ("waitlistEntryId") REFERENCES "WaitlistEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 6:** `npx prisma generate`. Expected: "Generated Prisma Client" with no error on the `Int[]` column (see Step 2's fallback note if it fails).

- [ ] **Step 7:** `npx tsc --noEmit` — clean.

- [ ] **Step 8: Snapshot.**

---

### Task 2: The pure matcher

**Files:** `src/lib/slot-fill-matching.ts`, `src/lib/slot-fill-matching.test.ts`.

**Interfaces:**
- Produces: `WaitlistCandidate = { id: string; clientId: string; service: string; staffMemberId: string | null; earliestDate: Date | null; preferredDays: number[]; preferredFrom: string | null; preferredTo: string | null; createdAt: Date }`; `FreedSlot = { service: string; staffMemberId: string | null; startAt: Date; weekday: number; timeMinutes: number }`; `findBestWaitlistMatch(candidates: WaitlistCandidate[], freedSlot: FreedSlot): WaitlistCandidate | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/slot-fill-matching.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findBestWaitlistMatch, type WaitlistCandidate } from "@/lib/slot-fill-matching";

const SLOT = {
  service: "Checkup",
  staffMemberId: "staff_1",
  startAt: new Date("2026-07-10T09:00:00Z"),
  weekday: 4, // Friday, Monday=0
  timeMinutes: 9 * 60,
};

function candidate(overrides: Partial<WaitlistCandidate> = {}): WaitlistCandidate {
  return {
    id: "wl_1",
    clientId: "client_1",
    service: "Checkup",
    staffMemberId: null,
    earliestDate: null,
    preferredDays: [],
    preferredFrom: null,
    preferredTo: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  };
}

describe("findBestWaitlistMatch", () => {
  it("matches on service, case/whitespace-insensitively", () => {
    expect(findBestWaitlistMatch([candidate({ service: " checkup " })], SLOT)?.id).toBe("wl_1");
    expect(findBestWaitlistMatch([candidate({ service: "Cleaning" })], SLOT)).toBeNull();
  });

  it("requires an exact provider match only when the candidate named one", () => {
    expect(findBestWaitlistMatch([candidate({ staffMemberId: null })], SLOT)?.id).toBe("wl_1");
    expect(findBestWaitlistMatch([candidate({ staffMemberId: "staff_1" })], SLOT)?.id).toBe("wl_1");
    expect(findBestWaitlistMatch([candidate({ staffMemberId: "staff_2" })], SLOT)).toBeNull();
  });

  it("respects earliestDate", () => {
    expect(findBestWaitlistMatch([candidate({ earliestDate: new Date("2026-07-11T00:00:00Z") })], SLOT)).toBeNull();
    expect(findBestWaitlistMatch([candidate({ earliestDate: new Date("2026-07-01T00:00:00Z") })], SLOT)?.id).toBe("wl_1");
  });

  it("respects preferredDays when set, ignores it when empty", () => {
    expect(findBestWaitlistMatch([candidate({ preferredDays: [0, 1, 2] })], SLOT)).toBeNull(); // Fri (4) not in Mon-Wed
    expect(findBestWaitlistMatch([candidate({ preferredDays: [4] })], SLOT)?.id).toBe("wl_1");
    expect(findBestWaitlistMatch([candidate({ preferredDays: [] })], SLOT)?.id).toBe("wl_1");
  });

  it("respects a preferred time window inclusive of its edges", () => {
    expect(findBestWaitlistMatch([candidate({ preferredFrom: "10:00", preferredTo: "12:00" })], SLOT)).toBeNull();
    expect(findBestWaitlistMatch([candidate({ preferredFrom: "09:00", preferredTo: "12:00" })], SLOT)?.id).toBe("wl_1");
  });

  it("picks whoever has waited longest among equally good matches", () => {
    const older = candidate({ id: "wl_old", createdAt: new Date("2026-01-01T00:00:00Z") });
    const newer = candidate({ id: "wl_new", createdAt: new Date("2026-06-15T00:00:00Z") });
    expect(findBestWaitlistMatch([newer, older], SLOT)?.id).toBe("wl_old");
  });

  it("returns null when nothing matches", () => {
    expect(findBestWaitlistMatch([], SLOT)).toBeNull();
    expect(findBestWaitlistMatch([candidate({ service: "Cleaning" })], SLOT)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/slot-fill-matching.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/slot-fill-matching.ts`. Reuse the existing `timeToMinutes` helper from `src/lib/calendar.ts` (grep it — confirm its exact export name and signature before importing; it's already used by `new-appointment-form.tsx` and `calendar/actions.ts`'s business-hours check) rather than writing a second HH:MM parser:

```ts
import { timeToMinutes } from "@/lib/calendar";

export type WaitlistCandidate = {
  id: string;
  clientId: string;
  service: string;
  staffMemberId: string | null;
  earliestDate: Date | null;
  /** Monday=0..Sunday=6, matching BusinessHours.weekday. Empty = no day preference. */
  preferredDays: number[];
  preferredFrom: string | null;
  preferredTo: string | null;
  createdAt: Date;
};

export type FreedSlot = {
  service: string;
  staffMemberId: string | null;
  startAt: Date;
  /** Monday=0..Sunday=6 — caller must derive this with the same (jsWeekday + 6) % 7 conversion used elsewhere in this codebase, in the clinic's time zone. */
  weekday: number;
  /** Minutes since midnight, clinic-local. */
  timeMinutes: number;
};

function normalizeService(value: string) {
  return value.trim().toLowerCase();
}

function matches(candidate: WaitlistCandidate, slot: FreedSlot): boolean {
  if (normalizeService(candidate.service) !== normalizeService(slot.service)) {
    return false;
  }
  if (candidate.staffMemberId && candidate.staffMemberId !== slot.staffMemberId) {
    return false;
  }
  if (candidate.earliestDate && slot.startAt.getTime() < candidate.earliestDate.getTime()) {
    return false;
  }
  if (candidate.preferredDays.length > 0 && !candidate.preferredDays.includes(slot.weekday)) {
    return false;
  }
  if (candidate.preferredFrom && slot.timeMinutes < timeToMinutes(candidate.preferredFrom)) {
    return false;
  }
  if (candidate.preferredTo && slot.timeMinutes > timeToMinutes(candidate.preferredTo)) {
    return false;
  }
  return true;
}

/**
 * The single best waiting-list match for a freed slot: same service, the
 * named provider if the entry has one, inside any day/time preference, then
 * whoever has waited longest. Returns null when nobody matches — never
 * guesses or relaxes a constraint to force a match.
 */
export function findBestWaitlistMatch(
  candidates: WaitlistCandidate[],
  freedSlot: FreedSlot
): WaitlistCandidate | null {
  const eligible = candidates.filter((candidate) => matches(candidate, freedSlot));

  if (eligible.length === 0) {
    return null;
  }

  return eligible.reduce((longestWaiting, candidate) =>
    candidate.createdAt.getTime() < longestWaiting.createdAt.getTime() ? candidate : longestWaiting
  );
}
```

- [ ] **Step 4: Run tests, type-check**

Run: `npx vitest run src/lib/slot-fill-matching.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Snapshot.**

---

### Task 3: Waiting-list data layer

**Files:** `src/lib/waitlist-data.ts`, `src/lib/waitlist-data.test.ts`.

**Interfaces:**
- Consumes: `WaitlistCandidate`/`FreedSlot` (Task 2).
- Produces: `listWaitingEntries(businessId): Promise<WaitlistEntryRow[]>`; `createWaitlistEntry(args): Promise<{ok:true}|{ok:false;error:string}>`; `removeWaitlistEntry(args:{id;businessId}): Promise<{ok:true}|{ok:false;error:string}>`; `findMatchingWaitlistCandidates(args:{businessId; service; tx?}): Promise<WaitlistCandidate[]>` (returns Prisma rows shaped to `WaitlistCandidate`, status `WAITING` only, for use by Task 4).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/waitlist-data.test.ts`, mirroring `src/lib/appointments-shared.test.ts`'s `vi.mock("@/lib/prisma", ...)` shape:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  waitlistEntry: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import {
  createWaitlistEntry,
  findMatchingWaitlistCandidates,
  listWaitingEntries,
  removeWaitlistEntry,
} from "@/lib/waitlist-data";

beforeEach(() => vi.clearAllMocks());

describe("waitlist data layer", () => {
  it("lists only WAITING entries for the business, oldest first", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([]);
    await listWaitingEntries("biz_1");
    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: "biz_1", status: "WAITING" }, orderBy: { createdAt: "asc" } })
    );
  });

  it("creates an entry scoped to the business", async () => {
    mocks.waitlistEntry.create.mockResolvedValue({ id: "wl_1" });
    const result = await createWaitlistEntry({
      businessId: "biz_1", clientId: "client_1", service: "Checkup",
      staffMemberId: null, earliestDate: null, preferredDays: [], preferredFrom: null, preferredTo: null, notes: null,
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.waitlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessId: "biz_1", clientId: "client_1", service: "Checkup", status: "WAITING" }) })
    );
  });

  it("removes an entry via a CAS-guarded update (status -> REMOVED), reporting a plain error if already gone", async () => {
    mocks.waitlistEntry.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await removeWaitlistEntry({ id: "wl_1", businessId: "biz_1" })).toEqual({ ok: true });

    mocks.waitlistEntry.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await removeWaitlistEntry({ id: "wl_1", businessId: "biz_1" })).toEqual({
      ok: false,
      error: "This waiting-list entry was already removed.",
    });
  });

  it("finds only WAITING candidates matching the given service, scoped to the business", async () => {
    mocks.waitlistEntry.findMany.mockResolvedValue([]);
    await findMatchingWaitlistCandidates({ businessId: "biz_1", service: "Checkup" });
    expect(mocks.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz_1", status: "WAITING" }) })
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/waitlist-data.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/waitlist-data.ts`:

```ts
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { WaitlistCandidate } from "@/lib/slot-fill-matching";

export type WaitlistEntryRow = {
  id: string;
  clientId: string;
  clientName: string;
  service: string;
  staffMemberId: string | null;
  staffMemberName: string | null;
  earliestDate: Date | null;
  preferredDays: number[];
  preferredFrom: string | null;
  preferredTo: string | null;
  notes: string | null;
  createdAt: Date;
};

export async function listWaitingEntries(businessId: string): Promise<WaitlistEntryRow[]> {
  const rows = await prisma.waitlistEntry.findMany({
    where: { businessId, status: "WAITING" },
    include: { client: { select: { name: true } }, staffMember: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    service: row.service,
    staffMemberId: row.staffMemberId,
    staffMemberName: row.staffMember?.name ?? null,
    earliestDate: row.earliestDate,
    preferredDays: row.preferredDays,
    preferredFrom: row.preferredFrom,
    preferredTo: row.preferredTo,
    notes: row.notes,
    createdAt: row.createdAt,
  }));
}

export async function createWaitlistEntry(args: {
  businessId: string;
  clientId: string;
  service: string;
  staffMemberId: string | null;
  earliestDate: Date | null;
  preferredDays: number[];
  preferredFrom: string | null;
  preferredTo: string | null;
  notes: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await prisma.waitlistEntry.create({ data: { ...args, status: "WAITING" } });
  return { ok: true };
}

const ALREADY_REMOVED_ERROR = "This waiting-list entry was already removed.";

/** Soft-remove via CAS: WAITING/OFFERED -> REMOVED, guarded so a concurrent offer/fill can't be silently discarded by a stale remove. */
export async function removeWaitlistEntry(args: {
  id: string;
  businessId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { count } = await prisma.waitlistEntry.updateMany({
    where: { id: args.id, businessId: args.businessId, status: { in: ["WAITING", "OFFERED"] } },
    data: { status: "REMOVED" },
  });
  return count === 0 ? { ok: false, error: ALREADY_REMOVED_ERROR } : { ok: true };
}

/**
 * Raw WAITING candidates for the matcher, shaped to WaitlistCandidate.
 * Optionally runs inside an existing transaction (`tx`) — cancelAppointmentCore
 * (Task 4) calls this from inside its own $transaction so the match read and
 * the eventual draft write are atomic with the cancellation itself.
 */
export async function findMatchingWaitlistCandidates(args: {
  businessId: string;
  service: string;
  tx?: Pick<PrismaClient, "waitlistEntry">;
}): Promise<WaitlistCandidate[]> {
  const client = args.tx ?? prisma;
  const rows = await client.waitlistEntry.findMany({
    where: { businessId: args.businessId, status: "WAITING", service: { equals: args.service, mode: "insensitive" } },
    select: {
      id: true,
      clientId: true,
      service: true,
      staffMemberId: true,
      earliestDate: true,
      preferredDays: true,
      preferredFrom: true,
      preferredTo: true,
      createdAt: true,
    },
  });

  return rows;
}
```

(The Prisma `mode: "insensitive"` filter narrows candidates at the DB level; the pure matcher's own `normalizeService` trim/lowercase still runs as the source of truth for the final decision, since `mode: "insensitive"` doesn't trim whitespace. Confirm `Prisma`/`PrismaClient` type imports resolve — if `tx` typing is awkward against the generated client, simplify to `unknown` cast at the one call site in Task 4 rather than fighting Prisma's transaction-client typing; note it as a ruling if you do.)

- [ ] **Step 4: Run tests, type-check**

Run: `npx vitest run src/lib/waitlist-data.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Snapshot.**

---

### Task 4: Wire matching into `cancelAppointmentCore`

**Files:** `src/lib/appointments-shared.ts`, `src/lib/appointments-shared.test.ts`.

**Interfaces:**
- Consumes: `findMatchingWaitlistCandidates` (Task 3), `findBestWaitlistMatch` (Task 2), `isProBusinessPlan` (`@/lib/billing`).
- No change to `cancelAppointmentCore`'s signature or return type — this is purely additional side-effect work inside its existing transaction, gated so it only ever runs for Pro.

- [ ] **Step 1: Read `cancelAppointmentCore`'s current full body** in `src/lib/appointments-shared.ts` before editing — it now has PR 1's reminder-deletion side effect and PR 3 may have added nothing to it directly (PR 3 only calls it). Confirm exactly where the guarded `updateMany` succeeds (`count > 0` branch) before its final `return { ok: true, ... changed: true }`.

- [ ] **Step 2: Write the failing tests**

In `src/lib/appointments-shared.test.ts`, extend the existing `cancelAppointmentCore` describe block (don't create a separate one — this is new behavior on existing behavior). Add mocks for `findMatchingWaitlistCandidates` and a `followUpDraft.create` / `waitlistEntry.updateMany` on the shared `mocks` object (match this file's existing mock-module shape), plus `isProBusinessPlan` mocked from `@/lib/billing`:

```ts
describe("cancelAppointmentCore — slot-fill matching", () => {
  it("does nothing extra when the workspace isn't on Pro", async () => {
    mocks.isProBusinessPlan.mockReturnValue(false);
    mockGuardHit(); // however this file already sets up a successful cancel
    await cancelAppointmentCore({ ...WHERE, businessPlan: "BASIC" }); // see Step 3 note on the signature question below
    expect(mocks.findMatchingWaitlistCandidates).not.toHaveBeenCalled();
  });

  it("creates one SLOT_OFFER draft and flips the matched entry to OFFERED when a match exists", async () => {
    mocks.isProBusinessPlan.mockReturnValue(true);
    mockGuardHit();
    mocks.findMatchingWaitlistCandidates.mockResolvedValue([
      { id: "wl_1", clientId: "client_2", service: "Checkup", staffMemberId: null, earliestDate: null, preferredDays: [], preferredFrom: null, preferredTo: null, createdAt: new Date("2026-01-01") },
    ]);

    await cancelAppointmentCore({ ...WHERE, businessPlan: "PRO" });

    expect(mocks.followUpDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "SLOT_OFFER",
          clientId: "client_2",
          waitlistEntryId: "wl_1",
          dedupeKey: expect.stringContaining("SLOT_OFFER:"),
        }),
      })
    );
    expect(mocks.waitlistEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "wl_1", status: "WAITING" }, data: { status: "OFFERED" } })
    );
  });

  it("creates nothing when no candidate matches", async () => {
    mocks.isProBusinessPlan.mockReturnValue(true);
    mockGuardHit();
    mocks.findMatchingWaitlistCandidates.mockResolvedValue([]);
    await cancelAppointmentCore({ ...WHERE, businessPlan: "PRO" });
    expect(mocks.followUpDraft.create).not.toHaveBeenCalled();
  });
});
```

**Signature question you must resolve, not guess past:** `cancelAppointmentCore` currently takes `{ id, businessId, staffMemberId? }` — it has no `businessPlan`. The matching step needs to know the plan to gate itself. Two options, pick one and document the choice as a ruling:
(a) widen `cancelAppointmentCore`'s `where` param to accept an optional `businessPlan?: BusinessPlan`, defaulting to skipping the match step when omitted (keeps every existing caller compiling unchanged, and PR 3's `applyInboundReplyIntent` caller would need to pass it too — check whether that matters there, since a patient's reply-cancel should also be eligible for slot-fill matching per the spec's "the shared cancelAppointmentCore... enqueues slot-fill matching" language, which doesn't carve out the reply path); or
(b) have `cancelAppointmentCore` look up the business's plan itself inside the transaction (`tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { plan: true } })`) — one extra read, but zero signature changes and zero risk of a caller forgetting to pass the flag.

**Take option (b)** — it's strictly safer (no caller can accidentally skip the gate by omitting a param) and costs one indexed primary-key read inside a transaction that's already doing several. Write the test mocks to match (b): mock `mocks.business.findUniqueOrThrow` (or whatever this file already uses to stub `tx.business`) to return `{ plan: "PRO" }` / `{ plan: "BASIC" }` instead of the `businessPlan` param shown in the sketch above — the sketch's `businessPlan` argument was illustrative of the *decision*, not the literal implementation; adjust the tests you actually write to option (b)'s real shape.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/appointments-shared.test.ts -t "slot-fill matching"`
Expected: FAIL.

- [ ] **Step 4: Implement**

Inside `cancelAppointmentCore`'s transaction, after the guarded update's `count > 0` branch resolves `updated` (the freshly-cancelled appointment row) and before its final return, add:

```ts
  const business = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { plan: true } });

  if (isProBusinessPlan(business.plan)) {
    const freedAppointment = await tx.appointment.findUniqueOrThrow({
      where: { id: updated.id },
      select: { title: true, staffMemberId: true, startAt: true },
    });

    const candidates = await findMatchingWaitlistCandidates({
      businessId,
      service: freedAppointment.title,
      tx,
    });

    const weekday = (freedAppointment.startAt.getUTCDay() + 6) % 7; // see this plan's Global Constraints: Monday=0..Sunday=6
    const timeMinutes = freedAppointment.startAt.getUTCHours() * 60 + freedAppointment.startAt.getUTCMinutes();

    const match = findBestWaitlistMatch(candidates, {
      service: freedAppointment.title,
      staffMemberId: freedAppointment.staffMemberId,
      startAt: freedAppointment.startAt,
      weekday,
      timeMinutes,
    });

    if (match) {
      const { count: offered } = await tx.waitlistEntry.updateMany({
        where: { id: match.id, status: "WAITING" },
        data: { status: "OFFERED" },
      });

      // Guard against a race where the entry was already claimed/removed
      // between the read above and this write — only draft when the flip
      // actually landed.
      if (offered > 0) {
        await tx.followUpDraft.create({
          data: {
            businessId,
            clientId: match.clientId,
            kind: "SLOT_OFFER",
            status: "PENDING",
            appointmentId: updated.id,
            waitlistEntryId: match.id,
            dedupeKey: `SLOT_OFFER:${updated.id}:${match.id}`,
            body: `A ${freedAppointment.title} slot just opened up. Would you like it?`,
          },
        });
      }
    }
  }
```

**Time-zone note to verify, not assume:** `freedAppointment.startAt` is a UTC-stored `DateTime`. The weekday/time-minutes derivation above uses `getUTCDay()`/`getUTCHours()` directly, which is only correct if the clinic's configured time zone is UTC or if `weekday`/`timeMinutes` are meant to be compared against `BusinessHours` in the same raw UTC frame `WaitlistEntry.preferredFrom/To` and `preferredDays` are entered in. **Check `src/lib/time-zone.ts` for a `getZonedWeekday`/similar helper (referenced in this codebase's dashboard/calendar code per this plan's research) and use that instead if the clinic can run in a non-UTC zone** — using raw UTC here when the clinic isn't UTC would silently shift every match by however many hours the offset is, exactly the class of bug CLAUDE.md's "raw pg DateTime" lesson warns about. This is flagged rather than pre-decided because it depends on whether staff enter `preferredFrom`/`preferredTo` in clinic-local time (almost certainly yes) — resolve this before writing the final code, and record whichever way you go as a ruling.

- [ ] **Step 5: Run tests, type-check**

Run: `npx vitest run src/lib/appointments-shared.test.ts`
Expected: PASS — every existing `cancelAppointmentCore` test plus the new ones.

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 6: Snapshot.**

---

### Task 5: Waiting-list panel (Calendar entry point)

**Files:**
- Create: `src/app/(workspace)/calendar/waitlist-actions.ts`, `src/app/(workspace)/calendar/waitlist-actions.test.ts`, `src/components/calendar/waitlist-panel.tsx`
- Modify: `src/components/calendar/calendar-workspace.tsx`, `src/app/(workspace)/calendar/page.tsx`

**Interfaces:**
- Consumes: `listWaitingEntries`/`createWaitlistEntry`/`removeWaitlistEntry` (Task 3).
- Produces: `addWaitlistEntryAction(payload): Promise<{ok;error?}>`; `removeWaitlistEntryAction(id): Promise<{ok;error?}>`.

- [ ] **Step 1: Write the failing action tests**

Read `src/app/(workspace)/calendar/actions.test.ts` first to match its exact `getAuthedBusiness` mock shape. Create `src/app/(workspace)/calendar/waitlist-actions.test.ts` covering: Pro-gate rejection on Basic (both actions), a successful add (Zod-validated payload — service required, client required, optional fields pass through as null when omitted), a successful remove, and remove's "already removed" error surfacing unchanged from the data layer.

- [ ] **Step 2: Run it to verify it fails.** Run: `npx vitest run "src/app/(workspace)/calendar/waitlist-actions.test.ts"` — FAIL (module doesn't exist).

- [ ] **Step 3: Implement the actions**

Create `src/app/(workspace)/calendar/waitlist-actions.ts` — `"use server"`, Zod schema for the add payload (`clientId`, `service` (1-200 chars), `staffMemberId` optional, `earliestDate` optional ISO date string, `preferredDays` optional `number[]` each `0-6`, `preferredFrom`/`preferredTo` optional `HH:MM` strings, `notes` optional), re-check `isProBusinessPlan(business.plan)` at the top of both actions (return a plain "Waiting list is part of the Pro plan." error otherwise — reuse the same phrasing convention as `NO_SHOW_PLAN_ERROR` from PR 1), call the Task 3 data functions, `revalidatePath("/calendar")` on success. Match `src/app/(workspace)/calendar/actions.ts`'s existing style (imports, `getAuthedBusiness` usage, typed result objects) exactly — read that file first.

- [ ] **Step 4: Run tests.** Run: `npx vitest run "src/app/(workspace)/calendar/waitlist-actions.test.ts"` — PASS.

- [ ] **Step 5: Build the panel and wire the entry point**

Create `src/components/calendar/waitlist-panel.tsx` — a client component: a small dialog/slide-over (reuse whatever primitive `AppointmentQuickView`-style floating cards or the app's `Dialog` primitive from `src/components/ui/` uses — check `components.json`/`src/components/ui/dialog.tsx` for the established pattern rather than building a new floating-panel mechanism) listing `WaitlistEntryRow`s (client name, service, provider if set, preferred window if set, a Remove button) plus an "+ Add" form (client picker — reuse the same picker component `new-appointment-form.tsx` uses, service text input, staff `<select>` mirroring that same form's inline pattern exactly per this plan's research — there is no reusable `<StaffPicker>` component in this codebase, only that one inline `<select>`, so copy its markup rather than inventing an abstraction for one caller, earliest-date input, preferred-days checkboxes labeled Mon–Sun in the Monday=0 order, preferred-from/to time inputs, notes textarea).

In `src/components/calendar/calendar-workspace.tsx`, add a `canManageWaitlist: boolean` prop (Pro-gated, same pattern as `canRecordNoShows`/`canViewNoShowRisk` from PR 1/2) and a small header button ("Waiting list") next to "New appointment" that opens the panel — **do not** add a description line, icon-in-tile, or bordered toolbar wrapper (AGENTS.md Calendar section: flat toolbar, no header description, rule 7's no-decorative-icon-badge).

In `src/app/(workspace)/calendar/page.tsx`, fetch `listWaitingEntries(business.id)` (Pro only — skip the query entirely on Basic, matching the cost-avoidance discipline PR 2 established) and pass both the entries and `canManageWaitlist={isProBusinessPlan(business.plan)}` down.

- [ ] **Step 6: Run all gates.** Run: `npx vitest run` — PASS. Run: `npx tsc --noEmit && npm run lint` — clean.

- [ ] **Step 7: Snapshot.**

---

### Task 6: "Book" from the Follow-ups page, and the pre-fill it needs

**Files:**
- Modify: `src/lib/follow-ups-data.ts`, `src/lib/follow-ups.ts`, `src/app/(workspace)/inbox/follow-ups/actions.ts`, `src/components/inbox/follow-ups-list.tsx`
- Modify: `src/app/(workspace)/calendar/new/page.tsx`, `src/components/calendar/new-appointment-form.tsx`

**Interfaces:**
- Produces: `bookFollowUpSlotAction(draftId: string): Promise<{ ok: true; bookingUrl: string } | { ok: false; error: string }>`; `NewAppointmentPage` gains `?service=`/`?staffMemberId=` query-param pre-fill.

- [ ] **Step 1: Widen the Follow-ups query (Deviation 2)**

In `src/lib/follow-ups-data.ts`, change `listPendingFollowUpDrafts` (or add a new function and switch the page to call it — implementer's call, whichever reads more clearly) to also include: `status: "SENT", kind: "SLOT_OFFER", waitlistEntry: { status: "OFFERED" } }`. Use an `OR` at the Prisma `where` level: `{ businessId, OR: [{ status: "PENDING" }, { status: "SENT", kind: "SLOT_OFFER", waitlistEntry: { status: "OFFERED" } }] }`. Write a test in `src/lib/follow-ups-data.test.ts` proving a `SENT` `REBOOK` draft is excluded while a `SENT` `SLOT_OFFER` with an `OFFERED` waitlist entry is included.

- [ ] **Step 2:** In `src/lib/follow-ups.ts`, add `canBook: boolean` to `FollowUpDraftItem`, computed as `draft.kind === "SLOT_OFFER" && draft.status === "SENT"`. Add a test.

- [ ] **Step 3: Write the failing test for `bookFollowUpSlotAction`**

In `src/app/(workspace)/inbox/follow-ups/actions.test.ts`, add a case: given a `SENT` `SLOT_OFFER` draft with a linked appointment (`title`, `staffMemberId`) and client (`id`), the action returns `{ ok: true, bookingUrl: "/calendar/new?client=<clientId>&service=<encoded title>&staffMemberId=<id>" }` — and a case where the draft isn't found/isn't a bookable slot offer, returning a plain error.

- [ ] **Step 4: Implement `bookFollowUpSlotAction`**

In `src/app/(workspace)/inbox/follow-ups/actions.ts`:

```ts
export async function bookFollowUpSlotAction(
  draftId: string
): Promise<{ ok: true; bookingUrl: string } | { ok: false; error: string }> {
  const context = await getAuthedBusiness();
  if ("error" in context) return { ok: false, error: context.error };

  const draft = await prisma.followUpDraft.findFirst({
    where: { id: draftId, businessId: context.business.id, kind: "SLOT_OFFER", status: "SENT" },
    select: {
      clientId: true,
      appointment: { select: { title: true, staffMemberId: true } },
    },
  });

  if (!draft) {
    return { ok: false, error: "This slot offer is no longer available." };
  }

  const params = new URLSearchParams({ client: draft.clientId });
  if (draft.appointment?.title) params.set("service", draft.appointment.title);
  if (draft.appointment?.staffMemberId) params.set("staffMemberId", draft.appointment.staffMemberId);

  return { ok: true, bookingUrl: `/calendar/new?${params.toString()}` };
}
```

(This does **not** mark anything `FILLED` yet — per the spec, the entry moves to `FILLED` only once the booking is actually saved, not when staff merely opens the pre-filled form. That write belongs in the calendar's own `saveAppointmentAction` — **only if** it can cheaply detect "this booking came from a waitlist offer", which it currently cannot. Given that gap, mark the entry `FILLED` here instead, at the point staff commits to booking by clicking "Book" — slightly earlier than ideal (a staff member who clicks Book but then abandons the form leaves the entry marked `FILLED` with no appointment), but far simpler than threading a hidden waitlist-entry-id through the booking form and its save action. Note this as a ruling; a future PR can tighten it if it proves to matter in practice.)

Revise the function to also flip the waitlist entry:

```ts
  await prisma.waitlistEntry.updateMany({
    where: { businessId: context.business.id, status: "OFFERED", followUpDrafts: { some: { id: draftId } } },
    data: { status: "FILLED" },
  });
```

Add this `updateMany` call right before the `return { ok: true, bookingUrl }` line, and add a test asserting it's called with a matching `where`.

- [ ] **Step 5: Add the "Book" button**

In `src/components/inbox/follow-ups-list.tsx`, for a row where `item.canBook` is true, replace/augment the Send/Skip pair with a single "Book" button that calls `bookFollowUpSlotAction` then `router.push(result.bookingUrl)` on success, or shows the plain error inline on failure (same busy/error pattern as the rest of this component).

- [ ] **Step 6: Add the pre-fill params**

In `src/app/(workspace)/calendar/new/page.tsx`, widen `searchParams` to include `service?: string; staffMemberId?: string`, validate `staffMemberId` against the fetched staff list the same way `client` is already validated (must be a real id in this business, else ignored), and pass `initialService`/`initialStaffMemberId` into `<NewAppointmentForm>`.

In `src/components/calendar/new-appointment-form.tsx`, add `initialService?: string; initialStaffMemberId?: string` to props; use `initialService` as the service `<Input>`'s `defaultValue` fallback (`initialAppointment?.service ?? initialService`); use `initialStaffMemberId` in `staffMemberId`'s `useState` initializer (`initialAppointment?.staffMemberId ?? initialStaffMemberId ?? staffMembers[0]?.id ?? ""`).

- [ ] **Step 7: Run all gates**

Run: `npx vitest run`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 8: Snapshot.**

---

### Task 7: Docs, copy, and final gates

**Files:** `AGENTS.md`, `PROJECT_STATUS.md`, `src/lib/public-plans.ts`.

- [ ] **Step 1:** Extend the existing no-show/risk-score bullet in `AGENTS.md`'s "Plans, Billing, and Feature Gating" section (grep the exact sentence PR 2's Task 5 left there) to also name the waiting list — one sentence, don't duplicate a bullet.
- [ ] **Step 2:** In `src/lib/public-plans.ts`, extend Pro's existing feature-list entry once more (same one PR 1/2 already extended) to mention slot offers, e.g. "No-show tracking, reporting, risk alerts, and automatic slot-offer drafts from your waiting list".
- [ ] **Step 3:** In `PROJECT_STATUS.md`, add a bullet: waiting list + slot-offer matching built and unit-tested, Pro-gated, schema applied status (name it explicitly — applied or not, matching the pattern PR 1's status bullet established), browser QA not yet run.
- [ ] **Step 4: Full gates.** Run: `npx vitest run` — all pass, including every PR 1/2/3 test file. Run: `npx tsc --noEmit && npm run lint` — clean.
- [ ] **Step 5: Snapshot and final whole-branch review** for this plan (Tasks 1-7 together) before moving to PR 5.
