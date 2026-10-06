# No-show Risk Score Implementation Plan (PR 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show staff, at a glance, which upcoming appointments are most likely to be no-shows and why — computed transparently from the patient's own history, never auto-acting on it.

**Architecture:** A pure, unit-tested scoring function (`scoreNoShowRisk`) takes a patient's recent finalized-visit history and one upcoming appointment, and returns a level + ordered reasons. A thin data layer (`getNoShowRiskAssessments`) batches the Prisma reads for a bounded set of on-screen appointments and calls the pure function per appointment — nothing is stored. Three read sites wire it in: the calendar quick-view popover, Day view, and the Dashboard's Today's schedule. All Pro-gated; Basic never sees a marker or pays for the query.

**Tech Stack:** Next.js 16 App Router (server actions), React 19, Prisma 6 + Postgres, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-22-no-show-and-workflows-design.md` (component 2). Builds on PR 1 (`docs/superpowers/plans/2026-09-22-no-show-status.md`, already implemented in this worktree, uncommitted).

## Deviations from the spec (documented, not asked — see Global Constraints on when to stop and ask)

1. **The marker only shows for Medium/High, never Low.** The spec says "a small Low/Medium/High marker"; AGENTS.md's anti-clutter rules (no filler, no decorative repetition) make a "Low risk" pill on the ~90% of ordinary appointments pure noise. Insufficient-history also renders nothing. This is a UI-only choice — the data layer and pure function still compute and return `"low"` and `insufficientHistory` accurately; only the badge component suppresses them.
2. **The Dashboard schedule only highlights High**, matching the spec's own wording ("High is highlighted on the Dashboard schedule") — Medium is not shown there, only in the calendar (quick-view, Day view).
3. **"Confirmed" is read from `status === "CONFIRMED"`**, not a separate signal — the codebase has no other confirmation flag today (confirm-by-reply lands in PR 3, and will simply flip the status, so this stays correct once that ships).
4. **Late-cancellation timing uses `Appointment.updatedAt`** as a proxy for when a CANCELLED row was cancelled — there's no dedicated `cancelledAt` column, and every cancellation path (`cancelAppointmentCore`) writes the status via a plain field update, so `updatedAt` reflects it. A stale note-only edit after a cancellation could skew this by minutes, not days — acceptable for a heuristic that only informs staff.

## Global Constraints

- Server-side computation only calls the data layer for Pro workspaces (`isProBusinessPlan(business.plan)`) — the plan gate lives at each call site (the new server action, the dashboard page), same discipline as PR 1's `NO_SHOW` gate. (CLAUDE.md)
- No patient names/diagnoses in logs or errors — log ids only. (CLAUDE.md)
- Customer-facing copy hides internals; no raw errors. (CLAUDE.md)
- `cn()` for conditional Tailwind classes; shared workspace primitives over bespoke JSX. (CLAUDE.md)
- AGENTS.md rule 7 (no decorative icon-in-tile badges) — the risk marker is a text-only tinted pill, same visual language as existing status badges, not an icon.
- Working tree is CRLF, git blobs are LF (`autocrlf=true`); use the Edit tool, not shell replacements.
- **No git commits** — this worktree stays uncommitted per the owner's "review everything locally first" instruction (see PR 1's ledger, Ruling R1). Snapshot each task with `.superpowers/sdd/2026-09-22-no-show-risk-score/snap.sh` (create it — copy PR 1's `.superpowers/sdd/2026-09-22-no-show-status/snap.sh` verbatim, same tracked paths) instead of `git commit`.
- Gates after every task: `npx vitest run <touched test files>`, then `npx tsc --noEmit && npm run lint` before moving on.
- No schema changes in this PR — nothing needs the owner's database go-ahead.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/no-show-risk.ts` | create | pure `scoreNoShowRisk()` — signals, weights, level |
| `src/lib/no-show-risk.test.ts` | create | unit tests for every signal and the insufficient-history rule |
| `src/lib/no-show-risk-data.ts` | create | batched Prisma read + per-appointment scoring, Pro-gated by caller |
| `src/lib/no-show-risk-data.test.ts` | create | mocked-Prisma tests: grouping by client, reminder lookup, upcoming-only filter |
| `src/components/calendar/no-show-risk-badge.tsx` | create | shared `<NoShowRiskBadge>` — one visual, reused everywhere |
| `src/app/(workspace)/calendar/actions.ts` | modify | `getNoShowRiskAction(appointmentIds)` |
| `src/app/(workspace)/calendar/actions.test.ts` | modify | tests for the new action (Pro gate, batching) |
| `src/components/calendar/calendar-workspace.tsx` | modify | fetch + show risk in quick-view and Day view |
| `src/app/(workspace)/calendar/page.tsx` | modify | pass `canViewNoShowRisk` |
| `src/lib/dashboard.ts` | modify | `DashboardAppointment.risk`, wire into `buildDashboardViewFromWorkspace` |
| `src/app/(workspace)/dashboard/page.tsx` | modify | fetch risk for today's Pending/Confirmed appointments |
| `src/components/dashboard/dashboard-overview.tsx` | modify | show the High badge on schedule rows |
| `AGENTS.md`, `src/lib/public-plans.ts` | modify | copy, only once the feature is real (Task 5) |

---

### Task 1: The pure scoring function

**Files:** Create `src/lib/no-show-risk.ts`, `src/lib/no-show-risk.test.ts`.

**Interfaces:**
- Produces: `NoShowRiskLevel = "low" | "medium" | "high"`; `NoShowRiskAssessment = { level: NoShowRiskLevel; reasons: string[]; insufficientHistory: boolean }`; `NoShowRiskPastVisit = { status: "COMPLETED" | "NO_SHOW" | "CANCELLED"; startAt: Date; updatedAt: Date }`; `NoShowRiskAppointmentInput = { startAt: Date; createdAt: Date; status: "PENDING" | "CONFIRMED"; reminderSent: boolean }`; `scoreNoShowRisk(pastVisits: NoShowRiskPastVisit[], appointment: NoShowRiskAppointmentInput): NoShowRiskAssessment`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/no-show-risk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreNoShowRisk, type NoShowRiskPastVisit } from "@/lib/no-show-risk";

const BASE_APPT = { startAt: new Date("2026-07-10T09:00:00Z"), createdAt: new Date("2026-07-05T09:00:00Z"), status: "CONFIRMED" as const, reminderSent: false };

function visit(status: NoShowRiskPastVisit["status"], startAt: string, updatedAt = startAt): NoShowRiskPastVisit {
  return { status, startAt: new Date(startAt), updatedAt: new Date(updatedAt) };
}

describe("scoreNoShowRisk", () => {
  it("says 'not enough history' with fewer than 2 past visits", () => {
    expect(scoreNoShowRisk([], BASE_APPT)).toEqual({
      level: "low",
      reasons: ["Not enough visit history yet"],
      insufficientHistory: true,
    });
    expect(scoreNoShowRisk([visit("COMPLETED", "2026-06-01T09:00:00Z")], BASE_APPT)).toMatchObject({
      insufficientHistory: true,
    });
  });

  it("is low with a clean history and no other signals", () => {
    const history = [visit("COMPLETED", "2026-06-01T09:00:00Z"), visit("COMPLETED", "2026-05-01T09:00:00Z")];
    expect(scoreNoShowRisk(history, BASE_APPT)).toEqual({ level: "low", reasons: [], insufficientHistory: false });
  });

  it("is high when a recent visit was a no-show", () => {
    const history = [visit("NO_SHOW", "2026-06-01T09:00:00Z"), visit("COMPLETED", "2026-05-01T09:00:00Z")];
    const result = scoreNoShowRisk(history, BASE_APPT);
    expect(result.level).toBe("high");
    expect(result.reasons[0]).toBe("Missed a recent appointment");
  });

  it("ignores a no-show outside the last 5 finalized visits", () => {
    const old = visit("NO_SHOW", "2020-01-01T09:00:00Z");
    const recentClean = Array.from({ length: 5 }, (_, i) => visit("COMPLETED", `2026-0${i + 1}-01T09:00:00Z`));
    expect(scoreNoShowRisk([old, ...recentClean], BASE_APPT).level).toBe("low");
  });

  it("is medium for a same-day (late) cancellation, but not for an early one", () => {
    const late = [
      visit("CANCELLED", "2026-06-01T09:00:00Z", "2026-06-01T02:00:00Z"), // cancelled 7h before start
      visit("COMPLETED", "2026-05-01T09:00:00Z"),
    ];
    expect(scoreNoShowRisk(late, BASE_APPT)).toMatchObject({ level: "medium", reasons: ["Cancelled last-minute recently"] });

    const early = [
      visit("CANCELLED", "2026-06-01T09:00:00Z", "2026-05-20T09:00:00Z"), // cancelled 12 days before
      visit("COMPLETED", "2026-05-01T09:00:00Z"),
    ];
    expect(scoreNoShowRisk(early, BASE_APPT)).toMatchObject({ level: "low", reasons: [] });
  });

  it("is medium for an unconfirmed reminder on a still-pending appointment", () => {
    const history = [visit("COMPLETED", "2026-06-01T09:00:00Z"), visit("COMPLETED", "2026-05-01T09:00:00Z")];
    const pending = { ...BASE_APPT, status: "PENDING" as const, reminderSent: true };
    expect(scoreNoShowRisk(history, pending)).toMatchObject({ level: "medium", reasons: ["Hasn't confirmed the reminder"] });

    const confirmed = { ...BASE_APPT, status: "CONFIRMED" as const, reminderSent: true };
    expect(scoreNoShowRisk(history, confirmed).reasons).not.toContain("Hasn't confirmed the reminder");
  });

  it("is low-scoring for a long lead time alone, but still names it as a reason", () => {
    const history = [visit("COMPLETED", "2026-06-01T09:00:00Z"), visit("COMPLETED", "2026-05-01T09:00:00Z")];
    const farOut = { ...BASE_APPT, startAt: new Date("2026-08-15T09:00:00Z"), createdAt: new Date("2026-07-01T09:00:00Z") };
    const result = scoreNoShowRisk(history, farOut);
    expect(result.level).toBe("low");
    expect(result.reasons).toContain("Booked far in advance");
  });

  it("stacks signals and orders reasons by weight, most important first", () => {
    const history = [visit("NO_SHOW", "2026-06-01T09:00:00Z"), visit("COMPLETED", "2026-05-01T09:00:00Z")];
    const pending = { ...BASE_APPT, status: "PENDING" as const, reminderSent: true };
    const result = scoreNoShowRisk(history, pending);
    expect(result.level).toBe("high");
    expect(result.reasons).toEqual(["Missed a recent appointment", "Hasn't confirmed the reminder"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/no-show-risk.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/no-show-risk.ts`:

```ts
export type NoShowRiskLevel = "low" | "medium" | "high";

/**
 * Transparent, weighted signals from the patient's own history — never an AI
 * call, never stored (see lib/no-show-risk-data.ts). `reasons` is ordered
 * most-important-first; it can be non-empty even at "low" (e.g. a long lead
 * time alone doesn't clear the medium threshold, but is still worth naming).
 */
export type NoShowRiskAssessment = {
  level: NoShowRiskLevel;
  reasons: string[];
  /** True with fewer than 2 past finalized visits — level is always "low" and reasons has exactly one entry. */
  insufficientHistory: boolean;
};

export type NoShowRiskPastVisit = {
  status: "COMPLETED" | "NO_SHOW" | "CANCELLED";
  startAt: Date;
  /** Proxy for "when this was cancelled" on a CANCELLED row — every cancel path writes the status via a plain field update, so Prisma's auto-managed updatedAt reflects it. Ignored for other statuses. */
  updatedAt: Date;
};

export type NoShowRiskAppointmentInput = {
  startAt: Date;
  createdAt: Date;
  status: "PENDING" | "CONFIRMED";
  reminderSent: boolean;
};

const RECENT_VISIT_WINDOW = 5;
const LATE_CANCEL_WINDOW_HOURS = 24;
const LONG_LEAD_TIME_DAYS = 30;
const HOUR_MS = 1000 * 60 * 60;
const DAY_MS = HOUR_MS * 24;

const WEIGHTS = {
  recentNoShow: 40,
  recentLateCancel: 20,
  unconfirmedReminder: 15,
  longLeadTime: 10,
} as const;

const HIGH_THRESHOLD = 40;
const MEDIUM_THRESHOLD = 15;

export function scoreNoShowRisk(
  pastVisits: NoShowRiskPastVisit[],
  appointment: NoShowRiskAppointmentInput
): NoShowRiskAssessment {
  if (pastVisits.length < 2) {
    return { level: "low", reasons: ["Not enough visit history yet"], insufficientHistory: true };
  }

  const recent = [...pastVisits]
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
    .slice(0, RECENT_VISIT_WINDOW);

  const signals: Array<{ weight: number; text: string }> = [];

  if (recent.some((visit) => visit.status === "NO_SHOW")) {
    signals.push({ weight: WEIGHTS.recentNoShow, text: "Missed a recent appointment" });
  }

  const hadLateCancel = recent.some((visit) => {
    if (visit.status !== "CANCELLED") return false;
    const hoursBeforeStart = (visit.startAt.getTime() - visit.updatedAt.getTime()) / HOUR_MS;
    return hoursBeforeStart >= 0 && hoursBeforeStart < LATE_CANCEL_WINDOW_HOURS;
  });
  if (hadLateCancel) {
    signals.push({ weight: WEIGHTS.recentLateCancel, text: "Cancelled last-minute recently" });
  }

  if (appointment.reminderSent && appointment.status !== "CONFIRMED") {
    signals.push({ weight: WEIGHTS.unconfirmedReminder, text: "Hasn't confirmed the reminder" });
  }

  const leadDays = (appointment.startAt.getTime() - appointment.createdAt.getTime()) / DAY_MS;
  if (leadDays >= LONG_LEAD_TIME_DAYS) {
    signals.push({ weight: WEIGHTS.longLeadTime, text: "Booked far in advance" });
  }

  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const level: NoShowRiskLevel = score >= HIGH_THRESHOLD ? "high" : score >= MEDIUM_THRESHOLD ? "medium" : "low";

  return {
    level,
    reasons: signals.sort((a, b) => b.weight - a.weight).map((signal) => signal.text),
    insufficientHistory: false,
  };
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/lib/no-show-risk.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Snapshot**

Run `.superpowers/sdd/2026-09-22-no-show-risk-score/snap.sh` (create the directory and copy PR 1's script verbatim first) and record the resulting tree hash in the ledger as this task's snapshot.

---

### Task 2: The data layer

**Files:** Create `src/lib/no-show-risk-data.ts`, `src/lib/no-show-risk-data.test.ts`.

**Interfaces:**
- Consumes: `scoreNoShowRisk` from Task 1; `prisma` from `@/lib/prisma`.
- Produces: `RiskableAppointment = { id: string; clientId: string; startAt: Date; createdAt: Date; status: "PENDING" | "CONFIRMED" }`; `getNoShowRiskAssessments(args: { businessId: string; appointments: RiskableAppointment[]; now?: Date }): Promise<Map<string, NoShowRiskAssessment>>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/no-show-risk-data.test.ts`. Mock `@/lib/prisma` the same way `src/lib/appointments-shared.test.ts` does (check that file first for the exact `vi.mock` shape used in this repo — reuse it, don't invent a new mocking pattern):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appointment: { findMany: vi.fn() },
  appointmentReminder: { findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks }));

import { getNoShowRiskAssessments } from "@/lib/no-show-risk-data";

const NOW = new Date("2026-07-01T00:00:00Z");
const FUTURE = new Date("2026-07-10T09:00:00Z");
const PAST = new Date("2026-06-20T09:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appointment.findMany.mockResolvedValue([]);
  mocks.appointmentReminder.findMany.mockResolvedValue([]);
});

describe("getNoShowRiskAssessments", () => {
  it("skips appointments that already started, without querying for them", async () => {
    const result = await getNoShowRiskAssessments({
      businessId: "biz_1",
      appointments: [{ id: "a1", clientId: "c1", startAt: PAST, createdAt: PAST, status: "CONFIRMED" }],
      now: NOW,
    });
    expect(result.size).toBe(0);
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });

  it("groups past visits by client and scores each upcoming appointment from only its own client's history", async () => {
    mocks.appointment.findMany.mockResolvedValue([
      { clientId: "c1", status: "NO_SHOW", startAt: new Date("2026-06-01T09:00:00Z"), updatedAt: new Date("2026-06-01T09:00:00Z") },
      { clientId: "c1", status: "COMPLETED", startAt: new Date("2026-05-01T09:00:00Z"), updatedAt: new Date("2026-05-01T09:00:00Z") },
      { clientId: "c2", status: "COMPLETED", startAt: new Date("2026-05-01T09:00:00Z"), updatedAt: new Date("2026-05-01T09:00:00Z") },
      { clientId: "c2", status: "COMPLETED", startAt: new Date("2026-04-01T09:00:00Z"), updatedAt: new Date("2026-04-01T09:00:00Z") },
    ]);

    const result = await getNoShowRiskAssessments({
      businessId: "biz_1",
      appointments: [
        { id: "a1", clientId: "c1", startAt: FUTURE, createdAt: PAST, status: "CONFIRMED" },
        { id: "a2", clientId: "c2", startAt: FUTURE, createdAt: PAST, status: "CONFIRMED" },
      ],
      now: NOW,
    });

    expect(result.get("a1")?.level).toBe("high");
    expect(result.get("a2")?.level).toBe("low");
    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "biz_1", clientId: { in: ["c1", "c2"] } }) })
    );
  });

  it("marks reminderSent true only for an appointment with a SENT reminder row", async () => {
    mocks.appointment.findMany.mockResolvedValue([
      { clientId: "c1", status: "COMPLETED", startAt: new Date("2026-05-01T09:00:00Z"), updatedAt: new Date("2026-05-01T09:00:00Z") },
      { clientId: "c1", status: "COMPLETED", startAt: new Date("2026-04-01T09:00:00Z"), updatedAt: new Date("2026-04-01T09:00:00Z") },
    ]);
    mocks.appointmentReminder.findMany.mockResolvedValue([{ appointmentId: "a1" }]);

    const result = await getNoShowRiskAssessments({
      businessId: "biz_1",
      appointments: [{ id: "a1", clientId: "c1", startAt: FUTURE, createdAt: PAST, status: "PENDING" }],
      now: NOW,
    });

    expect(result.get("a1")?.reasons).toContain("Hasn't confirmed the reminder");
  });

  it("returns an empty map and makes no queries when there is nothing upcoming", async () => {
    const result = await getNoShowRiskAssessments({ businessId: "biz_1", appointments: [], now: NOW });
    expect(result.size).toBe(0);
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/no-show-risk-data.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/no-show-risk-data.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { scoreNoShowRisk, type NoShowRiskAssessment } from "@/lib/no-show-risk";
import type { AppointmentStatus } from "@prisma/client";

const FINALIZED_STATUSES: AppointmentStatus[] = ["COMPLETED", "NO_SHOW", "CANCELLED"];

// Bounds the shared history read across every client the caller passed in —
// always a small, already-bounded set (one popover, one day, one dashboard
// list), never a whole-workspace scan.
const HISTORY_FETCH_CAP = 500;

export type RiskableAppointment = {
  id: string;
  clientId: string;
  startAt: Date;
  createdAt: Date;
  status: "PENDING" | "CONFIRMED";
};

/**
 * One risk assessment per upcoming appointment, computed from each client's
 * own finalized visit history. Nothing is stored — recomputed on every call.
 * Not plan-gated here: the caller (a server action, a page) checks
 * isProBusinessPlan first, same as every other Pro-only data path in this
 * codebase, so the check lives once per call site, not duplicated here.
 */
export async function getNoShowRiskAssessments(args: {
  businessId: string;
  appointments: RiskableAppointment[];
  now?: Date;
}): Promise<Map<string, NoShowRiskAssessment>> {
  const { businessId, appointments, now = new Date() } = args;
  const upcoming = appointments.filter((appointment) => appointment.startAt.getTime() > now.getTime());

  if (upcoming.length === 0) {
    return new Map();
  }

  const clientIds = [...new Set(upcoming.map((appointment) => appointment.clientId))];
  const appointmentIds = upcoming.map((appointment) => appointment.id);

  const [pastVisits, sentReminders] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId, clientId: { in: clientIds }, status: { in: FINALIZED_STATUSES } },
      select: { clientId: true, status: true, startAt: true, updatedAt: true },
      orderBy: { startAt: "desc" },
      take: HISTORY_FETCH_CAP,
    }),
    prisma.appointmentReminder.findMany({
      where: { appointmentId: { in: appointmentIds }, status: "SENT" },
      select: { appointmentId: true },
    }),
  ]);

  const remindedIds = new Set(sentReminders.map((reminder) => reminder.appointmentId));
  const visitsByClient = new Map<string, typeof pastVisits>();
  for (const visit of pastVisits) {
    const list = visitsByClient.get(visit.clientId);
    if (list) list.push(visit);
    else visitsByClient.set(visit.clientId, [visit]);
  }

  const results = new Map<string, NoShowRiskAssessment>();
  for (const appointment of upcoming) {
    const history = visitsByClient.get(appointment.clientId) ?? [];
    results.set(
      appointment.id,
      scoreNoShowRisk(
        history.map((visit) => ({
          status: visit.status as "COMPLETED" | "NO_SHOW" | "CANCELLED",
          startAt: visit.startAt,
          updatedAt: visit.updatedAt,
        })),
        {
          startAt: appointment.startAt,
          createdAt: appointment.createdAt,
          status: appointment.status,
          reminderSent: remindedIds.has(appointment.id),
        }
      )
    );
  }

  return results;
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx vitest run src/lib/no-show-risk-data.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Snapshot** (same mechanism as Task 1).

---

### Task 3: The shared badge, the calendar action, and calendar UI wiring

**Files:**
- Create: `src/components/calendar/no-show-risk-badge.tsx`
- Modify: `src/app/(workspace)/calendar/actions.ts` (imports; new action after `recordAppointmentAttendanceAction`)
- Modify: `src/app/(workspace)/calendar/actions.test.ts`
- Modify: `src/components/calendar/calendar-workspace.tsx` (quick-view fetch + render; Day view fetch + render)
- Modify: `src/app/(workspace)/calendar/page.tsx` (pass `canViewNoShowRisk`)

**Interfaces:**
- Consumes: `getNoShowRiskAssessments` (Task 2), `isProBusinessPlan` (`@/lib/billing`), `NoShowRiskAssessment` (Task 1).
- Produces: `getNoShowRiskAction(appointmentIds: string[]): Promise<Record<string, NoShowRiskAssessment>>`; `<NoShowRiskBadge risk={...} />`.

- [ ] **Step 1: The shared badge component**

Create `src/components/calendar/no-show-risk-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { NoShowRiskAssessment } from "@/lib/no-show-risk";

const LEVEL_STYLES = {
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
} as const;

const LEVEL_LABELS = {
  medium: "Medium risk",
  high: "High risk",
} as const;

/**
 * Only Medium/High render — a "Low risk" pill on most appointments would be
 * pure noise (AGENTS.md's anti-clutter rules). The top reason is the title
 * (hover), never printed inline, to keep the pill compact everywhere it's used.
 */
export function NoShowRiskBadge({ risk }: { risk: NoShowRiskAssessment | null | undefined }) {
  if (!risk || risk.insufficientHistory || risk.level === "low") {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium",
        LEVEL_STYLES[risk.level]
      )}
      title={risk.reasons[0] ?? undefined}
    >
      {LEVEL_LABELS[risk.level]}
    </span>
  );
}
```

- [ ] **Step 2: Write the failing action test**

In `src/app/(workspace)/calendar/actions.test.ts`, add a mock for `@/lib/no-show-risk-data` (`vi.hoisted` entry `getRiskAssessments: vi.fn()`, mocked via `vi.mock("@/lib/no-show-risk-data", () => ({ getNoShowRiskAssessments: mocks.getRiskAssessments }))`), import `getNoShowRiskAction`, and append:

```ts
describe("getNoShowRiskAction", () => {
  it("returns nothing for a workspace that isn't on Pro, without querying", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "BASIC" }, user: {} });

    expect(await getNoShowRiskAction(["a1"])).toEqual({});
    expect(mocks.appointment.findMany).not.toHaveBeenCalled();
  });

  it("looks up only PENDING/CONFIRMED rows in this business and returns the assessments as a plain object", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "PRO" }, user: {} });
    mocks.appointment.findMany.mockResolvedValue([
      { id: "a1", clientId: "c1", startAt: new Date("2026-07-10T09:00:00Z"), createdAt: new Date("2026-07-01T09:00:00Z"), status: "CONFIRMED" },
    ]);
    mocks.getRiskAssessments.mockResolvedValue(new Map([["a1", { level: "high", reasons: ["Missed a recent appointment"], insufficientHistory: false }]]));

    const result = await getNoShowRiskAction(["a1"]);

    expect(result).toEqual({ a1: { level: "high", reasons: ["Missed a recent appointment"], insufficientHistory: false } });
    expect(mocks.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["a1"] }, businessId: "biz_1", status: { in: ["PENDING", "CONFIRMED"] } }),
      })
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run "src/app/(workspace)/calendar/actions.test.ts"`
Expected: FAIL — `getNoShowRiskAction` is not exported.

- [ ] **Step 4: Implement the action**

In `src/app/(workspace)/calendar/actions.ts`, add `import { getNoShowRiskAssessments } from "@/lib/no-show-risk-data";` and `import type { NoShowRiskAssessment } from "@/lib/no-show-risk";`. After `recordAppointmentAttendanceAction`, add:

```ts
/**
 * Batched risk lookup for whatever's currently on screen (a quick-view
 * popover, one Day-view column). Pro only — a Basic workspace gets an empty
 * object, not an error, so the UI can call this unconditionally and just get
 * nothing back to render.
 */
export async function getNoShowRiskAction(
  appointmentIds: string[]
): Promise<Record<string, NoShowRiskAssessment>> {
  if (appointmentIds.length === 0) {
    return {};
  }

  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {};
  }

  const business = context.business;

  if (!isProBusinessPlan(business.plan)) {
    return {};
  }

  const rows = await prisma.appointment.findMany({
    where: {
      id: { in: appointmentIds },
      businessId: business.id,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { id: true, clientId: true, startAt: true, createdAt: true, status: true },
  });

  const assessments = await getNoShowRiskAssessments({
    businessId: business.id,
    appointments: rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      startAt: row.startAt,
      createdAt: row.createdAt,
      status: row.status as "PENDING" | "CONFIRMED",
    })),
  });

  return Object.fromEntries(assessments);
}
```

- [ ] **Step 5: Run tests, type-check**

Run: `npx vitest run "src/app/(workspace)/calendar/actions.test.ts"`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Wire the quick-view popover**

In `src/components/calendar/calendar-workspace.tsx`:

1. Add `canViewNoShowRisk: boolean` to `CalendarWorkspaceProps` and destructure it in `CalendarWorkspace(...)` alongside `canRecordNoShows`.
2. Import `getNoShowRiskAction` from `./actions` (check the existing relative import path used for `recordAppointmentAttendanceAction` and match it) and `NoShowRiskBadge` from `./no-show-risk-badge`, and `NoShowRiskAssessment` type from `@/lib/no-show-risk`.
3. Add state: `const [risk, setRisk] = useState<Record<string, NoShowRiskAssessment>>({});`
4. Add an effect that fires whenever the popover opens on a new appointment, only when `canViewNoShowRisk`:

```ts
useEffect(() => {
  if (!canViewNoShowRisk || !quickView) return;
  const id = quickView.appointment.id;
  if (risk[id]) return; // already have it — popovers reopen on the same appointment often
  let cancelled = false;
  void getNoShowRiskAction([id]).then((result) => {
    if (!cancelled) setRisk((current) => ({ ...current, ...result }));
  });
  return () => {
    cancelled = true;
  };
}, [canViewNoShowRisk, quickView, risk]);
```

5. Pass `risk={risk[appointment.id]}` as a new prop on `<AppointmentQuickView>` (both the type and the JSX at the existing call site around line 1105).
6. In `AppointmentQuickView`, add `risk?: NoShowRiskAssessment` to its props type, and render `<NoShowRiskBadge risk={risk} />` directly after the "Status" row (inside the `space-y-1.5` block, as its own `flex items-center justify-between` row labeled the same way as Status, or simply appended after that row's closing `</div>` — match the existing row style: a muted label "Risk" left, the badge right, and only render the row at all when `risk && !risk.insufficientHistory && risk.level !== "low"` so an empty row never appears).

- [ ] **Step 7: Wire Day view**

Still in `calendar-workspace.tsx`, find where Day view renders its column of entries (the view that lists every appointment for one day, per AGENTS.md's Calendar section — grep for `view === "day"` or the Day-view-specific row renderer). Add:

1. An effect keyed on `[canViewNoShowRisk, view, activeDate, appointments]` that, only when `view === "day"`, collects the ids of that day's `PENDING`/`CONFIRMED` appointments not already in `risk`, and calls `getNoShowRiskAction` once for the whole batch (not per-row) if the list is non-empty.
2. In the Day-view row markup, render `<NoShowRiskBadge risk={risk[entry.id]} />` inline next to the existing status text (the row already shows "service · staff" and status in words per AGENTS.md — add the badge after status, same row, no new line).

- [ ] **Step 8: Pass the new prop from the page**

In `src/app/(workspace)/calendar/page.tsx`, find where `canRecordNoShows` is computed and passed to `<CalendarWorkspace>` (both server components — grep `canRecordNoShows` in this file). Add `canViewNoShowRisk={isProBusinessPlan(business.plan)}` right beside it (same value; kept as a separate prop so each component's purpose stays self-documenting, matching the spec's separate numbered components).

- [ ] **Step 9: Run all gates**

Run: `npx vitest run` (full suite — this task touches shared calendar files, run everything to catch a ripple)
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 10: Snapshot**

---

### Task 4: Dashboard wiring

**Files:**
- Modify: `src/lib/dashboard.ts` (`DashboardAppointment` type; `buildDashboardViewFromWorkspace` args + appointment mapping + `nextDashboardAppointment`)
- Modify: `src/lib/dashboard.test.ts`
- Modify: `src/app/(workspace)/dashboard/page.tsx` (fetch risk for today's Pending/Confirmed rows, only on Pro)
- Modify: `src/components/dashboard/dashboard-overview.tsx` (render the High badge)

**Interfaces:**
- Consumes: `getNoShowRiskAssessments` (Task 2), `NoShowRiskBadge` (Task 3), `isProBusinessPlan`.
- Produces: `DashboardAppointment.risk?: NoShowRiskAssessment`; `buildDashboardViewFromWorkspace` gains an optional `noShowRisk?: Map<string, NoShowRiskAssessment>` arg.

- [ ] **Step 1: Write the failing test**

In `src/lib/dashboard.test.ts`, find the test(s) that call `buildDashboardViewFromWorkspace` with a sample `appointments` array (reuse its existing fixture helpers) and append:

```ts
it("attaches a risk assessment to a schedule appointment when one is provided", () => {
  const risk = new Map([["appt_1", { level: "high" as const, reasons: ["Missed a recent appointment"], insufficientHistory: false }]]);
  const view = buildDashboardViewFromWorkspace({
    ...BASE_ARGS, // reuse whatever this file's existing tests call the shared fixture object
    appointments: [APPT_FIXTURE], // reuse an existing appointment fixture with id "appt_1"
    noShowRisk: risk,
  });

  expect(view.appointments[0]?.risk).toEqual({ level: "high", reasons: ["Missed a recent appointment"], insufficientHistory: false });
});

it("leaves risk undefined when none was provided", () => {
  const view = buildDashboardViewFromWorkspace({ ...BASE_ARGS, appointments: [APPT_FIXTURE] });
  expect(view.appointments[0]?.risk).toBeUndefined();
});
```

Adjust `BASE_ARGS`/`APPT_FIXTURE` names to whatever this file's existing tests actually call their shared setup — read the file first and match it exactly rather than inventing new fixture names.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: FAIL — `risk` is not a recognized argument / not present on the result.

- [ ] **Step 3: Implement**

In `src/lib/dashboard.ts`:

- Import `NoShowRiskAssessment` from `@/lib/no-show-risk`.
- Add `risk?: NoShowRiskAssessment;` to `DashboardAppointment` (after `status`).
- In `buildDashboardViewFromWorkspace`'s args type, add `noShowRisk?: Map<string, NoShowRiskAssessment>;` and destructure it (default `undefined`, no `= new Map()` — a lookup on `undefined?.get(id)` is already safe and skips allocating an empty Map on every Basic-plan call).
- In the `appointments.map(...)` building `appointments:` (the block with `id: appointment.id, time: …`), add `risk: noShowRisk?.get(appointment.id),` after `status: toDashboardStatus(appointment.status),`.
- In `nextDashboardAppointment` (the `nextAppointment ? { id: …, … } : null` block), add the same `risk: noShowRisk?.get(nextAppointment.id),` line.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the page**

In `src/app/(workspace)/dashboard/page.tsx`:

1. Import `getNoShowRiskAssessments` from `@/lib/no-show-risk-data`.
2. After the `Promise.allSettled([...])` block resolves and `appointments` is available (the `const appointments = appointmentsResult.status === "fulfilled" ? … : [];` line), add:

```ts
const upcomingForRisk = appointments.filter(
  (appointment) => appointment.status === "PENDING" || appointment.status === "CONFIRMED"
);
const noShowRisk = isProBusinessPlan(business.plan) && upcomingForRisk.length > 0
  ? await getNoShowRiskAssessments({
      businessId: business.id,
      appointments: upcomingForRisk.map((appointment) => ({
        id: appointment.id,
        clientId: appointment.clientId,
        startAt: appointment.startAt,
        createdAt: appointment.createdAt,
        status: appointment.status as "PENDING" | "CONFIRMED",
      })),
    })
  : undefined;
```

3. Pass `noShowRisk,` into the `buildDashboardViewFromWorkspace({ … })` call.
4. `TodayAppointmentWithRelations` (wherever it's typed/imported in this file) already includes `clientId`/`createdAt` as plain Prisma scalar fields — no `select`/`include` change needed; confirm this compiles rather than assuming.

- [ ] **Step 6: Render the badge**

In `src/components/dashboard/dashboard-overview.tsx`, find where each Today's-schedule row and the "Next up" panel render an appointment's client name/status (grep `appointmentsToday` sibling usage or the component that maps `view.appointments`). Import `NoShowRiskBadge` from `@/components/calendar/no-show-risk-badge`. Add, next to the client name or status text (whichever placement doesn't force a second line — AGENTS.md's dashboard section keeps this row compact):

```tsx
{appointment.risk?.level === "high" ? <NoShowRiskBadge risk={appointment.risk} /> : null}
```

(Only High renders here — see the plan's Deviation 2. Do not use the badge component's own Medium/High logic unmodified for this one call site; the extra `level === "high"` guard is deliberate and specific to the dashboard.)

- [ ] **Step 7: Run all gates**

Run: `npx vitest run`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 8: Snapshot**

---

### Task 5: Docs, copy, and final gates

**Files:** `AGENTS.md`, `src/lib/public-plans.ts`, `PROJECT_STATUS.md`.

- [ ] **Step 1:** In `AGENTS.md`, "Plans, Billing, and Feature Gating", extend the existing no-show bullet (added by PR 1) so it also names the risk score, e.g.: "No-show tracking (recording a no-show, the no-show rate in Reports, and the no-show risk score on upcoming appointments) is Pro. Basic workspaces keep the four existing statuses and no risk markers." — grep for the exact existing sentence first and edit it in place rather than duplicating a second bullet (PR 1's ledger already hit this duplication trap once).
- [ ] **Step 2:** In `src/lib/public-plans.ts`, Pro's feature list already has "No-show tracking and reporting" (PR 1) — extend that single entry's copy (don't add a second line) to mention the risk score, e.g. "No-show tracking, reporting, and risk alerts".
- [ ] **Step 3:** In `PROJECT_STATUS.md`, add one bullet under the same section PR 1's no-show entry lives in: risk score built and unit-tested, Pro-gated, no schema change, not yet applied anywhere requiring a database change (there is none) — and that it hasn't had browser QA yet if that's still true when this task runs (check Task 4's own testing note before writing this).
- [ ] **Step 4: Full gates**

Run: `npx vitest run`
Expected: all pass, including every PR 1 test file (this PR must not regress it).

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Snapshot and final review**

Snapshot, then proceed to subagent-driven-development's final whole-branch review for this plan (covering Tasks 1-5 together, diffed against Task 1's BASE snapshot) before moving to PR 3.
