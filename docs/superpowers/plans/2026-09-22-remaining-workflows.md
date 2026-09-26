# Rebooking Nudges, Payment Reminders, Thank-Yous Implementation Plan (PR 5 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the last three drafted-message workflows: rebooking nudges (Pro), unpaid-balance reminders (all plans), and after-visit thank-yous (all plans) — the last pieces of the Follow-ups list (PR 3) that were always meant to populate it.

**Architecture:** One new `WorkflowSettings` model (deferred from PR 3 — this is where it actually earns its keep) holds each workflow's on/off switch and timing per business. Three small, independently-testable generator functions each scan for candidates and write `FollowUpDraft` rows, deduplicated by `dedupeKey` (idempotent — safe to re-run, safe to run concurrently with itself). A new, dedicated hourly cron route runs all three. A new "Workflows" Settings section exposes the toggles.

**Tech Stack:** Next.js 16 App Router (server actions, cron routes), React 19, Prisma 6 + Postgres, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-22-no-show-and-workflows-design.md` (component 6). Builds on PR 1-4, all of which must be implemented before this plan starts (this plan's Task 1 assumes `FollowUpDraft`, `Client.lastVisitAt`, and `ClientPayment` already exist and behave as documented below).

## Deviations from the spec (documented, not asked)

1. **A new, separate cron route (`/api/cron/follow-ups`), not "a new step after reminders" inside the existing one.** `src/app/api/cron/reminders/route.ts` is a carefully tuned piece of infrastructure — a named lock with a TTL derived from a hard response deadline, a per-business timeout with "abandoned business" tracking, a fairness cursor, and a `withDeadline` wrapper whose failure-recovery path reads live-mutated progress state. That entire apparatus exists to prevent one failure mode: **double-sending a real WhatsApp message** when Vercel Cron overlaps invocations. Draft generation has no equivalent failure mode — every draft write goes through `dedupeKey`'s unique constraint, so a re-run, an overlap, or a crash mid-loop can at worst attempt a duplicate insert that the database itself rejects harmlessly (caught the same way `messaging/inbound.ts` already catches a `P2002` race). Bolting three new generators into the reminders route's deadline/lock/cursor machinery would risk that route's correctness for a job that doesn't need any of those protections — this is exactly what CLAUDE.md's `ponytail-review` mindset flags as over-engineering transplanted from the wrong place. A separate route, with a much simpler single-lock-single-pass structure, is proportionate to the actual risk.
2. **`WorkflowSettings` is built now, not in PR 3.** PR 3 deferred it because confirm-by-reply had nothing to configure. This PR's three workflows all need a toggle + a timing window, so the model finally has real fields — see PR 3's plan, Deviation 2, which named this PR as where it would land.
3. **A new "Workflows" Settings section** is added to the settled six-section list in AGENTS.md's Settings component design. This is a genuine new section, not a re-interpretation of an existing one — AGENTS.md documents the six sections as "the settled component designs," not a closed list that forbids ever adding a seventh for a real new feature; Task 4 updates that section's text in the same change that adds the UI, per this repo's standing rule that a locked decision changes only in the commit that overrides it.
4. **Rebook nudges use only `Client.lastVisitAt`, not a computed "last completed visit."** The field already exists and is kept correct by every appointment-mutation path that matters (`refreshClientLastVisitAt`, called from `cancelAppointmentCore`, `recordAppointmentAttendanceCore`, `deleteAppointmentCore` — see PR 1). Recomputing it independently here would duplicate logic that's already the single source of truth for "when did this client last actually come in."

## Global Constraints

- **Plan gating**: rebook nudges are Pro-only (`isProBusinessPlan`) — the generator itself checks the business's plan before running for that business, same discipline as every other Pro gate in this codebase. Payment reminders and thank-yous run for every plan.
- `WorkflowSettings` toggles for the Pro-only workflow (rebook) are hidden on the Basic Settings UI (spec: "WorkflowSettings toggles for gated workflows are hidden on Basic").
- Every drafted message stays minimum-necessary: name + appointment/payment time only, no clinical/service detail beyond what's already elsewhere in this codebase's reminder copy (CLAUDE.md, AGENTS.md).
- `dedupeKey` uniqueness is the only concurrency protection this PR relies on — do not add a lock, a cursor, or a deadline budget "to be safe"; that complexity belongs only where a real double-send risk exists (see Deviation 1).
- All "N days/hours/months" windows use the clinic zone helpers in `src/lib/time-zone.ts`, never server-local/raw UTC arithmetic where the clinic's zone could differ — this is a named, recurring bug class in this codebase (see PR 4's plan, Task 4's time-zone note).
- Working tree is CRLF, git blobs are LF (`autocrlf=true`); use the Edit tool, not shell text replacement.
- **No git commits.** Snapshot each task with `.superpowers/sdd/2026-09-22-remaining-workflows/snap.sh` (copy PR 1's `snap.sh` verbatim).
- Gates after every task: touched test files, then `npx tsc --noEmit && npm run lint`. Final task runs the full suite.
- **Schema change needs the owner's explicit go-ahead** (Task 0).
- Editing `vercel.json` to add the new cron route is a plain, uncommitted file edit like everything else this session — not a live deploy action. Do not attempt to trigger, verify, or simulate an actual Vercel Cron invocation; that only matters once this is deployed, which is out of scope for this session.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | modify | `WorkflowSettings` model, `Business.workflowSettings` back-relation |
| `prisma/workflow-settings-migration.sql` | create | additive: one new table |
| `src/lib/workflow-generators.ts` | create | three candidate-finder + draft-builder functions |
| `src/lib/workflow-generators.test.ts` | create | unit tests (mocked Prisma) |
| `src/app/api/cron/follow-ups/route.ts` | create | the new cron route |
| `src/lib/follow-up-generation.ts` | create | orchestration: loads eligible businesses, calls the three generators, writes drafts |
| `src/lib/follow-up-generation.test.ts` | create | job-level tests |
| `vercel.json` | modify | new cron entry |
| `src/app/(workspace)/settings/actions.ts` | modify | save workflow toggles/timings |
| `src/app/(workspace)/settings/actions.test.ts` | modify | tests |
| `src/components/settings/workflows-section.tsx` | create | the new Settings section |
| `src/components/settings/settings-dialog.tsx` (or wherever the section nav list lives) | modify | add "Workflows" to the nav |
| `AGENTS.md`, `PROJECT_STATUS.md`, `src/lib/public-plans.ts` | modify | copy/docs (final task) |

---

### Task 0: Get the database go-ahead (no code)

- [ ] **Step 1: Ask the owner**

Say exactly: "PR 5 (the last one) needs one additive schema change: a new `WorkflowSettings` table — one row per business, holding the on/off switches and timing for rebooking nudges, payment reminders, and thank-yous. Nothing existing is altered. OK to run it?" Do not run any SQL until they answer yes.

- [ ] **Step 2: Record the deploy order.** Apply before this PR's code deploys.

---

### Task 1: Schema

**Files:** `prisma/schema.prisma`, `prisma/workflow-settings-migration.sql`.

- [ ] **Step 1:** Add the model, mirroring `ReminderSettings`' exact shape (`businessId String @unique` + cascading relation, boolean toggles with defaults, plain `Int` windows, `updatedAt` only — no `createdAt`, rows created lazily on first save):

```prisma
model WorkflowSettings {
  id                       String   @id @default(cuid())
  businessId               String   @unique
  business                 Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  rebookEnabled            Boolean  @default(false)
  rebookAfterMonths        Int      @default(6)
  paymentReminderEnabled   Boolean  @default(true)
  paymentReminderAfterDays Int      @default(3)
  thankYouEnabled          Boolean  @default(true)
  thankYouDelayHours       Int      @default(2)
  updatedAt                DateTime @updatedAt
}
```

(`rebookEnabled` defaults `false` — Pro workflow, off until the owner turns it on, per the spec's "off until enabled for Pro ones"; the Basic-available workflows default `true`, per "defaults on for Basic workflows".)

- [ ] **Step 2:** Add `workflowSettings WorkflowSettings?` to `Business` (grep where `reminderSettings ReminderSettings?` is declared and add immediately after, matching formatting).

- [ ] **Step 3:** Create `prisma/workflow-settings-migration.sql`:

```sql
-- Workflow settings (rebooking nudges, payment reminders, thank-yous)
-- =============================================================================
-- One new table, fully additive. Nothing existing is altered. Reads a
-- WorkflowSettings row that doesn't exist yet (most businesses, until they
-- save this new Settings section) already fall back to code-level defaults —
-- see src/lib/workflow-generators.ts — so this migration alone changes
-- nothing observable until this PR's code deploys.
CREATE TABLE "WorkflowSettings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "rebookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rebookAfterMonths" INTEGER NOT NULL DEFAULT 6,
    "paymentReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "paymentReminderAfterDays" INTEGER NOT NULL DEFAULT 3,
    "thankYouEnabled" BOOLEAN NOT NULL DEFAULT true,
    "thankYouDelayHours" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowSettings_businessId_key" ON "WorkflowSettings"("businessId");

ALTER TABLE "WorkflowSettings" ADD CONSTRAINT "WorkflowSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4:** `npx prisma generate`, then `npx tsc --noEmit` — clean.

- [ ] **Step 5: Snapshot.**

---

### Task 2: The three generators

**Files:** `src/lib/workflow-generators.ts`, `src/lib/workflow-generators.test.ts`.

**Interfaces:**
- Produces: `WorkflowSettingsValues = { rebookEnabled; rebookAfterMonths; paymentReminderEnabled; paymentReminderAfterDays; thankYouEnabled; thankYouDelayHours }`; `DEFAULT_WORKFLOW_SETTINGS: WorkflowSettingsValues`; `FollowUpDraftInput = { clientId: string; kind: "REBOOK"|"PAYMENT"|"THANK_YOU"; body: string; appointmentId?: string; dedupeKey: string }`; `findRebookCandidates(args): Promise<FollowUpDraftInput[]>`; `findPaymentReminderCandidates(args): Promise<FollowUpDraftInput[]>`; `findThankYouCandidates(args): Promise<FollowUpDraftInput[]>` — each `args: { businessId: string; settings: WorkflowSettingsValues; now: Date }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/workflow-generators.test.ts`, mirroring the `vi.mock("@/lib/prisma", ...)` shape already used elsewhere:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  clientPayment: { findMany: vi.fn() },
  appointment: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import {
  DEFAULT_WORKFLOW_SETTINGS,
  findPaymentReminderCandidates,
  findRebookCandidates,
  findThankYouCandidates,
} from "@/lib/workflow-generators";

const NOW = new Date("2026-07-01T12:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("findRebookCandidates", () => {
  it("finds clients whose last visit is older than the configured window and have no future appointment", async () => {
    mocks.client.findMany.mockResolvedValue([{ id: "c1", name: "Alex", lastVisitAt: new Date("2026-01-01T00:00:00Z") }]);

    const result = await findRebookCandidates({ businessId: "biz_1", settings: DEFAULT_WORKFLOW_SETTINGS, now: NOW });

    expect(result).toEqual([
      {
        clientId: "c1",
        kind: "REBOOK",
        body: expect.stringContaining("Alex"),
        dedupeKey: "REBOOK:c1:2026-07",
      },
    ]);
    expect(mocks.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz_1",
          lastVisitAt: { not: null, lt: new Date("2026-01-01T12:00:00Z") }, // 6 months before NOW
          appointments: { none: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: NOW } } },
        }),
      })
    );
  });

  it("returns nothing when rebooking is disabled", async () => {
    const result = await findRebookCandidates({
      businessId: "biz_1",
      settings: { ...DEFAULT_WORKFLOW_SETTINGS, rebookEnabled: false },
      now: NOW,
    });
    expect(result).toEqual([]);
    expect(mocks.client.findMany).not.toHaveBeenCalled();
  });
});

describe("findPaymentReminderCandidates", () => {
  it("finds unpaid/partially-paid payments older than the configured window, one draft per payment", async () => {
    mocks.clientPayment.findMany.mockResolvedValue([
      { id: "pay_1", clientId: "c1", client: { name: "Alex" }, amountCents: 5000, status: "Unpaid", createdAt: new Date("2026-06-20T00:00:00Z") },
    ]);

    const result = await findPaymentReminderCandidates({ businessId: "biz_1", settings: DEFAULT_WORKFLOW_SETTINGS, now: NOW });

    expect(result).toEqual([
      { clientId: "c1", kind: "PAYMENT", body: expect.stringContaining("Alex"), dedupeKey: "PAYMENT:pay_1" },
    ]);
    expect(mocks.clientPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz_1",
          status: { in: ["Unpaid", "Partially Paid"] },
          createdAt: { lt: new Date("2026-06-28T12:00:00Z") }, // 3 days before NOW
        }),
      })
    );
  });

  it("returns nothing when disabled", async () => {
    expect(
      await findPaymentReminderCandidates({ businessId: "biz_1", settings: { ...DEFAULT_WORKFLOW_SETTINGS, paymentReminderEnabled: false }, now: NOW })
    ).toEqual([]);
  });
});

describe("findThankYouCandidates", () => {
  it("finds appointments completed within the delay window, dedupe keyed per appointment", async () => {
    mocks.appointment.findMany.mockResolvedValue([
      { id: "appt_1", clientId: "c1", client: { name: "Alex" }, endAt: new Date("2026-07-01T09:30:00Z") },
    ]);

    const result = await findThankYouCandidates({ businessId: "biz_1", settings: DEFAULT_WORKFLOW_SETTINGS, now: NOW });

    expect(result).toEqual([
      { clientId: "c1", kind: "THANK_YOU", appointmentId: "appt_1", body: expect.stringContaining("Alex"), dedupeKey: "THANK_YOU:appt_1" },
    ]);
  });

  it("returns nothing when disabled", async () => {
    expect(
      await findThankYouCandidates({ businessId: "biz_1", settings: { ...DEFAULT_WORKFLOW_SETTINGS, thankYouEnabled: false }, now: NOW })
    ).toEqual([]);
  });
});
```

(These tests pin the exact `where` shape for the first two — read the brief's Step 3 implementation below before finalizing the `expect.objectContaining` date math, and adjust if your actual implementation computes the cutoff slightly differently; the *behavior* — window length, enabled-gate, dedupeKey shape — is what must hold, not necessarily this literal Date value if you choose a different but equally correct computation.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/workflow-generators.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/workflow-generators.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";
import { formatCurrency } from "@/lib/utils";

export type WorkflowSettingsValues = {
  rebookEnabled: boolean;
  rebookAfterMonths: number;
  paymentReminderEnabled: boolean;
  paymentReminderAfterDays: number;
  thankYouEnabled: boolean;
  thankYouDelayHours: number;
};

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettingsValues = {
  rebookEnabled: false,
  rebookAfterMonths: 6,
  paymentReminderEnabled: true,
  paymentReminderAfterDays: 3,
  thankYouEnabled: true,
  thankYouDelayHours: 2,
};

export type FollowUpDraftInput = {
  clientId: string;
  kind: "REBOOK" | "PAYMENT" | "THANK_YOU";
  body: string;
  appointmentId?: string;
  dedupeKey: string;
};

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Clients whose last visit is older than the configured window, with no
 * future booking. dedupeKey includes the month, so at most one rebook draft
 * is ever pending per client per calendar month — a natural rate limit that
 * needs no separate "already has an open draft" check.
 */
export async function findRebookCandidates(args: {
  businessId: string;
  settings: WorkflowSettingsValues;
  now: Date;
}): Promise<FollowUpDraftInput[]> {
  const { businessId, settings, now } = args;
  if (!settings.rebookEnabled) return [];

  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - settings.rebookAfterMonths);

  const clients = await prisma.client.findMany({
    where: {
      businessId,
      isArchived: false,
      lastVisitAt: { not: null, lt: cutoff },
      appointments: { none: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gt: now } } },
    },
    select: { id: true, name: true },
  });

  return clients.map((client) => ({
    clientId: client.id,
    kind: "REBOOK" as const,
    body: `Hi ${client.name}, it's been a while since your last visit — want to book your next appointment?`,
    dedupeKey: `REBOOK:${client.id}:${monthKey(now)}`,
  }));
}

/** One draft per unpaid/partially-paid payment older than the configured window. */
export async function findPaymentReminderCandidates(args: {
  businessId: string;
  settings: WorkflowSettingsValues;
  now: Date;
}): Promise<FollowUpDraftInput[]> {
  const { businessId, settings, now } = args;
  if (!settings.paymentReminderEnabled) return [];

  const cutoff = new Date(now.getTime() - settings.paymentReminderAfterDays * 24 * 60 * 60 * 1000);

  const payments = await prisma.clientPayment.findMany({
    where: { businessId, status: { in: ["Unpaid", "Partially Paid"] }, createdAt: { lt: cutoff } },
    select: { id: true, clientId: true, client: { select: { name: true } }, amountCents: true },
  });

  return payments.map((payment) => ({
    clientId: payment.clientId,
    kind: "PAYMENT" as const,
    body: `Hi ${payment.client.name}, a friendly reminder that you have an outstanding balance of ${formatCurrency(payment.amountCents)}.`,
    dedupeKey: `PAYMENT:${payment.id}`,
  }));
}

/** One draft per appointment that completed inside the delay window — see this file's caller (follow-up-generation.ts) for the hourly lookback window that bounds this query. */
export async function findThankYouCandidates(args: {
  businessId: string;
  settings: WorkflowSettingsValues;
  now: Date;
  lookbackWindowStart: Date;
}): Promise<FollowUpDraftInput[]> {
  const { businessId, settings, now, lookbackWindowStart } = args;
  if (!settings.thankYouEnabled) return [];

  const cutoff = new Date(now.getTime() - settings.thankYouDelayHours * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: { businessId, status: "COMPLETED", endAt: { lte: cutoff, gt: lookbackWindowStart } },
    select: { id: true, clientId: true, client: { select: { name: true } }, endAt: true },
  });

  return appointments.map((appointment) => ({
    clientId: appointment.clientId,
    kind: "THANK_YOU" as const,
    appointmentId: appointment.id,
    body: `Thank you for visiting us, ${appointment.client.name}! We hope to see you again soon.`,
    dedupeKey: `THANK_YOU:${appointment.id}`,
  }));
}
```

**Fix the test/implementation mismatch before moving on:** the sketch test for `findThankYouCandidates` above doesn't pass `lookbackWindowStart` — the real implementation requires it (see the reasoning in Task 3, which needs a bounded window so this function doesn't rescan the clinic's entire history every hour). Update the test to pass a `lookbackWindowStart` (e.g. `new Date("2026-07-01T08:00:00Z")`, one hour before `NOW`) when you write it for real — the sketch above is illustrative of the shape, not literal code to paste in unmodified.

Confirm `formatCurrency` (from `@/lib/utils`) and `formatZonedFullDate`/`formatZonedTime` (imported but not yet used above — remove the unused import, or use them if you decide the rebook/thank-you copy should reference a specific date, matching the minimum-necessary "name + time" content rule from CLAUDE.md; the thank-you message above has no time reference since it's sent after the fact, but check whether the design spec's minimum-necessary rule expects one and adjust if so) exist with these signatures before using them — grep first.

- [ ] **Step 4: Run tests, type-check**

Run: `npx vitest run src/lib/workflow-generators.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Snapshot.**

---

### Task 3: The cron route and orchestration

**Files:** `src/lib/follow-up-generation.ts`, `src/lib/follow-up-generation.test.ts`, `src/app/api/cron/follow-ups/route.ts`, `vercel.json`.

**Interfaces:**
- Consumes: `findRebookCandidates`/`findPaymentReminderCandidates`/`findThankYouCandidates`/`DEFAULT_WORKFLOW_SETTINGS` (Task 2); `isProBusinessPlan` (`@/lib/billing`).
- Produces: `generateFollowUpDrafts(now?: Date): Promise<{ businessesProcessed: number; draftsCreated: number; errors: number }>`.

- [ ] **Step 1: Write the failing job-level test**

Create `src/lib/follow-up-generation.test.ts`. Mock `@/lib/prisma` (`business.findMany`, `followUpDraft.createMany` or per-row `create` — pick one and be consistent, see Step 3's note on `createMany` vs per-row `create` and P2002), and mock `@/lib/workflow-generators`'s three functions plus `isProBusinessPlan`. Cover:

- Loads only businesses with `whatsappEnabled: true` (same precondition reminders.ts already uses — a draft nobody can ever send is pointless busywork) and a `workflowSettings` row when one exists, falling back to `DEFAULT_WORKFLOW_SETTINGS` when it doesn't.
- Skips `findRebookCandidates` entirely for a Basic-plan business (calls the other two, not that one) — a direct assertion, not just "no draft was created," since the point is avoiding the wasted query, not just avoiding the wasted write.
- Writes one `FollowUpDraft` per candidate returned by the three generators, tolerating (not failing the whole run on) a duplicate-key collision from a candidate that already has a pending draft — same P2002-as-benign-no-op pattern as `messaging/inbound.ts`.
- One business throwing doesn't stop the others — the job continues and reports it in `errors`.

- [ ] **Step 2: Run it to verify it fails.** Run: `npx vitest run src/lib/follow-up-generation.test.ts` — FAIL (module doesn't exist).

- [ ] **Step 3: Implement**

Create `src/lib/follow-up-generation.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { isProBusinessPlan } from "@/lib/billing";
import {
  DEFAULT_WORKFLOW_SETTINGS,
  findPaymentReminderCandidates,
  findRebookCandidates,
  findThankYouCandidates,
  type FollowUpDraftInput,
} from "@/lib/workflow-generators";
import { logger } from "@/lib/logger";

// Matches this cron's own schedule (hourly, see vercel.json) — bounds the
// thank-you scan to appointments that completed since the last run, instead
// of rescanning the clinic's whole COMPLETED history every hour.
const LOOKBACK_WINDOW_MS = 60 * 60 * 1000;

async function writeDrafts(businessId: string, inputs: FollowUpDraftInput[]): Promise<number> {
  let created = 0;

  for (const input of inputs) {
    try {
      await prisma.followUpDraft.create({
        data: {
          businessId,
          clientId: input.clientId,
          kind: input.kind,
          status: "PENDING",
          appointmentId: input.appointmentId,
          dedupeKey: input.dedupeKey,
          body: input.body,
        },
      });
      created += 1;
    } catch (error) {
      // A dedupeKey collision means this exact draft already exists — benign,
      // same pattern as messaging/inbound.ts's providerMessageSid race.
      const isDuplicateKey =
        typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
      if (!isDuplicateKey) {
        throw error;
      }
    }
  }

  return created;
}

export async function generateFollowUpDrafts(
  now: Date = new Date()
): Promise<{ businessesProcessed: number; draftsCreated: number; errors: number }> {
  const businesses = await prisma.business.findMany({
    where: { whatsappEnabled: true },
    select: { id: true, plan: true, workflowSettings: true },
  });

  let draftsCreated = 0;
  let errors = 0;
  const lookbackWindowStart = new Date(now.getTime() - LOOKBACK_WINDOW_MS);

  for (const business of businesses) {
    try {
      const settings = business.workflowSettings ?? DEFAULT_WORKFLOW_SETTINGS;
      const isPro = isProBusinessPlan(business.plan);

      const [rebook, payment, thankYou] = await Promise.all([
        isPro ? findRebookCandidates({ businessId: business.id, settings, now }) : Promise.resolve([]),
        findPaymentReminderCandidates({ businessId: business.id, settings, now }),
        findThankYouCandidates({ businessId: business.id, settings, now, lookbackWindowStart }),
      ]);

      draftsCreated += await writeDrafts(business.id, [...rebook, ...payment, ...thankYou]);
    } catch (error) {
      errors += 1;
      logger.error("Follow-up draft generation failed for a business.", error, { businessId: business.id });
    }
  }

  return { businessesProcessed: businesses.length, draftsCreated, errors };
}
```

- [ ] **Step 4: Run tests, type-check**

Run: `npx vitest run src/lib/follow-up-generation.test.ts`
Expected: PASS.

- [ ] **Step 5: The cron route**

Read `src/app/api/cron/analytics/route.ts` first — the design spec's "new step after reminders" language aside, `analytics` is the better structural template here: it's the codebase's other **simple**, single-pass daily cron (no fairness cursor, no per-business abandonment tracking), much closer in risk profile to this job than `reminders` is (see Deviation 1). Match its lock/auth/response shape, not `reminders`' shape.

Create `src/app/api/cron/follow-ups/route.ts`:

```ts
import { NextResponse } from "next/server";

import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { generateFollowUpDrafts } from "@/lib/follow-up-generation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LOCK_NAME = "follow-ups";
const LOCK_TTL_SECONDS = 150;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const lock = await acquireCronLock(LOCK_NAME, LOCK_TTL_SECONDS);
  if (!lock.proceed) {
    logger.warn("Follow-up draft generation skipped — a previous run is still in progress.");
    return NextResponse.json({ ok: true, skipped: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await generateFollowUpDrafts();
    return NextResponse.json({ ok: true, ...result }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("Follow-up draft generation cron failed.", error);
    return NextResponse.json({ ok: false, error: "Follow-up draft generation failed." }, { status: 500 });
  } finally {
    await releaseCronLock(LOCK_NAME, lock.token);
  }
}
```

(Verify `acquireCronLock`/`releaseCronLock`/`isAuthorizedCronRequest`'s exact signatures against `src/app/api/cron/analytics/route.ts`'s real usage before finalizing — the sketch above assumes they match the reminders route's shape, which they should since both crons already share these helpers, but confirm rather than assume.)

- [ ] **Step 6: Add the cron entry**

In `vercel.json`, add a new entry to the `crons` array: `{ "path": "/api/cron/follow-ups", "schedule": "40 * * * *" }` — hourly, offset from `reminders` (`0 * * * *`) and `storage-cleanup` (`20 * * * *`) so the three don't all fire in the same minute.

- [ ] **Step 7: Run all gates.** Run: `npx vitest run` — PASS. Run: `npx tsc --noEmit && npm run lint` — clean.

- [ ] **Step 8: Snapshot.**

---

### Task 4: Settings UI

**Files:** `src/app/(workspace)/settings/actions.ts`, `src/app/(workspace)/settings/actions.test.ts`, `src/components/settings/workflows-section.tsx`, plus whichever file holds the section nav list (grep "Business details" or "WhatsApp" as a nav-row label to find it).

- [ ] **Step 1:** Read the existing "Reminders" section's component and its save action first — AGENTS.md's Settings component design explicitly describes it as "two fixed-height divided toggle rows (\"First/Second reminder\" + inline \"Nh before\" select; \"Off\" when disabled)" — this is the exact visual pattern to copy for three toggle rows instead of two (rebook — Pro only, hidden entirely on Basic per Global Constraints — payment, thank-you), each with its own inline "N days/months/hours" select shown only while enabled.

- [ ] **Step 2: Write the failing action test**

In `src/app/(workspace)/settings/actions.test.ts`, add a case for a new `saveWorkflowSettingsAction(payload)`: validates and upserts a `WorkflowSettings` row (`prisma.workflowSettings.upsert`), rejects `rebookEnabled: true` from a Basic-plan business with a plain plan error (re-checked server-side, not just hidden in the UI — CLAUDE.md), and revalidates whatever path the Settings dialog needs revalidated (check how the Reminders section's own save action revalidates and match it).

- [ ] **Step 3: Run it to verify it fails**, then implement `saveWorkflowSettingsAction` in `src/app/(workspace)/settings/actions.ts`, matching the file's existing Zod-schema-plus-typed-result-object style exactly.

- [ ] **Step 4:** Build `src/components/settings/workflows-section.tsx` and wire it into the section nav (icon tile + title + one-line subtitle per the nav-row pattern AGENTS.md documents) and the master-detail right pane's section switch.

- [ ] **Step 5: Run all gates.** Run: `npx vitest run` — PASS. Run: `npx tsc --noEmit && npm run lint` — clean.

- [ ] **Step 6: Snapshot.**

---

### Task 5: Docs, copy, and final gates

**Files:** `AGENTS.md`, `PROJECT_STATUS.md`, `src/lib/public-plans.ts`.

- [ ] **Step 1:** In AGENTS.md's Settings section, add "Workflows" to the six-section list with a one-line description (rebooking/payment/thank-you toggles), matching the existing entries' voice — this is Deviation 3, made concrete.
- [ ] **Step 2:** Extend the same Pro feature-list entry in `src/lib/public-plans.ts` one final time to mention rebooking nudges (payment reminders and thank-yous are on every plan, so they belong in the general feature list, not the Pro-only one — check where "reminders" is already listed for Basic/every-plan copy and add them there instead if they're not implied by existing reminder copy).
- [ ] **Step 3:** In `PROJECT_STATUS.md`, add a bullet: all three remaining workflows built and unit-tested; the Follow-ups page (PR 3) now has real producers; note the new `follow-ups` cron isn't live until `vercel.json`'s change is actually deployed (this session doesn't deploy anything).
- [ ] **Step 4: Full gates.** Run: `npx vitest run` — all pass, including every PR 1-4 test file. Run: `npx tsc --noEmit && npm run lint` — clean.
- [ ] **Step 5: Snapshot and final whole-branch review** for this plan (Tasks 1-5). This is the last PR in the series — after this review is clean, the whole `docs/superpowers/specs/2026-09-22-no-show-and-workflows-design.md` design is fully implemented (uncommitted, in this worktree), ready for the owner's local review.
