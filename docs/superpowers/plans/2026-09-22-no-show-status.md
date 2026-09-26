# No-show Status Implementation Plan (PR 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Pro workspaces record a patient as a **no-show**, and report on it, without breaking any place in the app that already switches on appointment status.

**Architecture:** Add `NO_SHOW` to the `AppointmentStatus` enum (additive SQL migration). Make every status mapper, style map, and rate calculation handle it (Task 1–3). Add a Pro-gated server path to set it — through the edit form's Status dropdown and a lightweight "mark as no-show / attended" action (Task 4) — and expose that action as a button in the calendar's appointment quick-view popover (Task 5). Reports gain a real no-show rate (Task 3).

**Tech Stack:** Next.js 16 App Router (server actions), React 19, Prisma 6 + Postgres, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-22-no-show-and-workflows-design.md` (component 1). PRs 2–5 (risk score, Follow-ups list + confirm-by-reply, waiting list, the three drafted-message workflows) each get their own plan written just before they start, once this one has landed.

## Deviations from the approved spec (owner to confirm)

Reading the code changed three things. They are small, but they are not what the spec said:

1. **No dashboard "did they come?" card.** `completePastConfirmedAppointments` (`src/lib/appointments.ts`, run from `(workspace)/layout.tsx` at most every 5 minutes) automatically flips every CONFIRMED visit to COMPLETED once it ends. A list of "still Pending/Confirmed" visits would almost always be empty, and the dashboard layout is design-locked in AGENTS.md. Instead, staff mark exceptions from the **calendar quick-view popover** ("Mark as no-show", and "Mark as attended" to undo). Completed → No-show corrections are therefore the normal path.
2. **Reports Highlights stays at five tiles.** AGENTS.md locks "up to five compact tiles". The No-show rate tile only appears when a no-show exists and sits ahead of Follow-up coverage; if six would show, Active clients is the one dropped.
3. **Mobile app shows a no-show as cancelled.** The Vela Staff app only knows four statuses; an unknown value could break it. A slot that didn't happen reads as cancelled there until the app learns a fifth state.

## Global Constraints

- Server actions live in `actions.ts` next to their route, return typed result objects, and re-check the plan server-side (`isProBusinessPlan(business.plan)`); UI gating alone is never enough. (CLAUDE.md)
- Customer-facing copy hides providers and never shows raw errors; errors are short, plain sentences. (CLAUDE.md)
- No patient names/diagnoses in logs or errors — log ids only. (CLAUDE.md)
- Revalidate every surface a mutation feeds: `revalidateCalendarSurfaces(clientIds, staffIds)` already covers calendar, dashboard, clients, reports, staff. (CLAUDE.md)
- Appointment status tones are one shared set everywhere. No-show is **violet** (`violet-500` dot, `violet-50`/`violet-800` pill, `#8b5cf6` raw). Do not reuse the destructive red — Cancelled already owns it. (AGENTS.md "same tone set as everywhere else")
- Reports Highlights: up to five tiles, only ones with measured data render. (AGENTS.md, locked)
- The Reports view-model characterization snapshot (`src/lib/__snapshots__/reports.test.ts.snap`) must stay **byte-identical**; new report fields render only when a no-show exists.
- Schema changes are applied to the shared database only with the owner's explicit go-ahead; **never run `prisma db push`** from this plan (see Task 0).
- Working tree is CRLF, git blobs are LF (`autocrlf=true`); use the Edit tool for edits, not shell replacements that assume line endings.
- Every commit ends with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`; the PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Gates before every push: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`. Review: one CodeRabbit run only (no Codex); after each fix push, post `@coderabbitai full review` once its automatic run has ended.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | modify | add `NO_SHOW` to `AppointmentStatus` |
| `prisma/no-show-status-migration.sql` | create | additive, idempotent SQL for the shared database |
| `src/lib/appointment-status.ts` | create | `appointmentStatusKey()` — one hyphenated lowercase name for display/styling |
| `src/lib/calendar.ts` | modify | status type + exported mappers handle `no-show` |
| `src/lib/dashboard.ts`, `src/lib/dashboard-data.ts`, `src/app/(workspace)/dashboard/page.tsx` | modify | status type; completion rate counts no-shows; visits chart excludes them |
| `src/lib/mobile/serializers.ts` | modify | NO_SHOW → `"cancelled"` for the mobile app |
| `src/lib/status-tone.ts`, `src/components/reports/overview-tab.tsx` | modify | violet tone + Highlights tile |
| `src/components/calendar/calendar-workspace.tsx` | modify | tone maps, quick-view button, `canRecordNoShows` prop |
| `src/components/calendar/new-appointment-form.tsx` | modify | "No-show" option (Pro only) |
| `src/components/dashboard/dashboard-overview.tsx`, `src/components/staff/staff-details-page.tsx`, `src/components/clients/client-details-page.tsx` | modify | tone maps / badges |
| `src/lib/staff.ts`, `src/lib/staff-data.ts`, `src/lib/clients.ts`, `src/lib/reminders.ts` | modify | completion rate, real `noShows`, no reminders |
| `src/lib/reports.ts` | modify | no-show stats, delta, detail row, status mix |
| `src/lib/appointments-shared.ts` | modify | `recordAppointmentAttendanceCore` + shared error strings |
| `src/app/(workspace)/calendar/actions.ts` | modify | Pro/started checks in save; `recordAppointmentAttendanceAction` |
| `src/app/(workspace)/calendar/page.tsx`, `.../[appointmentId]/edit/page.tsx` | modify | pass `canRecordNoShows` |
| `src/lib/public-plans.ts`, `AGENTS.md`, `PROJECT_STATUS.md` | modify | copy + docs, only once the feature exists |

---

### Task 0: Get the database go-ahead (no code)

**Deliverable:** the owner's explicit yes to applying one additive statement to the shared database. Everything below can be written and unit-tested without it; **browser QA (Task 6) and the merge cannot.**

- [ ] **Step 1: Ask the owner**

Say exactly: "PR 1 needs one additive change to the shared database: `ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';`. It doesn't affect the running app (nothing writes the new value until this ships), and it has to be applied **before** the code deploys. OK to run it?" Do not run any SQL until they answer yes.

- [ ] **Step 2: Record the deploy order**

Order is fixed: (1) apply the SQL, (2) merge/deploy the code. Reversing it makes every no-show write fail in production.

---

### Task 1: Make every status mapper and style map handle NO_SHOW

**Files:**
- Modify: `prisma/schema.prisma:534-539`
- Create: `prisma/no-show-status-migration.sql`, `src/lib/appointment-status.ts`
- Modify: `src/lib/calendar.ts` (type at line 13; `toCalendarStatus` line 141, `toCalendarTone` line 157, `toPrismaAppointmentStatus` line 173)
- Modify: `src/app/(workspace)/calendar/actions.ts` (`hydrateAppointment`, lines 142–169; import list lines 25–31)
- Modify: `src/lib/dashboard.ts` (type line 14, `toDashboardStatus` line 208)
- Modify: `src/lib/mobile/serializers.ts` (line 118)
- Modify: `src/lib/status-tone.ts`, `src/components/reports/overview-tab.tsx` (`statusColor`, line 130)
- Modify: `src/components/calendar/calendar-workspace.tsx` (lines 69–80), `src/components/dashboard/dashboard-overview.tsx` (lines 20–32)
- Modify: `src/components/staff/staff-details-page.tsx` (line 432), `src/components/clients/client-details-page.tsx` (lines 916, 1343), `src/lib/clients.ts` (lines 341, 504), `src/lib/staff.ts` (line 434)
- Test: `src/lib/calendar.test.ts`, `src/lib/mobile/serializers.test.ts`, `src/lib/appointment-status.test.ts`

**Interfaces:**
- Produces: `CalendarAppointmentStatus` gains `"no-show"`; `DashboardAppointmentStatus` gains `"no-show"`; `toCalendarStatus(status: Appointment["status"]): CalendarAppointmentStatus` and `toCalendarTone(status: Appointment["status"]): CalendarAppointmentTone` become **exported**; `appointmentStatusKey(status: AppointmentStatus): string` (`"NO_SHOW"` → `"no-show"`, others lowercased); `APPOINTMENT_STATUS_COLORS.noShow`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/calendar.test.ts` (change its first import line to `import { buildCalendarViewFromRecords, businessHoursForDate, toCalendarStatus, toCalendarTone, toPrismaAppointmentStatus } from "@/lib/calendar";`):

```ts
describe("appointment status mapping", () => {
  it("round-trips every Prisma status through the calendar status", () => {
    for (const status of ["CONFIRMED", "PENDING", "CANCELLED", "COMPLETED", "NO_SHOW"] as const) {
      expect(toPrismaAppointmentStatus(toCalendarStatus(status))).toBe(status);
    }
  });

  it("names the no-show status and gives it the muted tone", () => {
    expect(toCalendarStatus("NO_SHOW")).toBe("no-show");
    expect(toCalendarTone("NO_SHOW")).toBe("muted");
  });
});
```

In `src/lib/mobile/serializers.test.ts`, inside the `serializeAppointment` describe, after the "lowercases every status…" test, add:

```ts
  it("shows a no-show as cancelled — the mobile app has no fifth status", () => {
    expect(serializeAppointment(appt({ status: "NO_SHOW" }), "today").status).toBe("cancelled");
  });
```

Create `src/lib/appointment-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { appointmentStatusKey } from "@/lib/appointment-status";

describe("appointmentStatusKey", () => {
  it("lowercases plain statuses and hyphenates NO_SHOW", () => {
    expect(appointmentStatusKey("CONFIRMED")).toBe("confirmed");
    expect(appointmentStatusKey("COMPLETED")).toBe("completed");
    expect(appointmentStatusKey("NO_SHOW")).toBe("no-show");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/calendar.test.ts src/lib/mobile/serializers.test.ts src/lib/appointment-status.test.ts`
Expected: FAIL — `toCalendarStatus` is not exported / `appointment-status` cannot be resolved / mobile status is `"no_show"`.

- [ ] **Step 3: Add the enum value, the SQL, and regenerate the client**

In `prisma/schema.prisma`, change the enum to:

```prisma
enum AppointmentStatus {
  CONFIRMED
  PENDING
  CANCELLED
  COMPLETED
  NO_SHOW
}
```

Create `prisma/no-show-status-migration.sql`:

```sql
-- No-show appointment status
-- =============================================================================
-- Adds NO_SHOW to the AppointmentStatus enum. Additive and backward compatible:
-- the running app never writes or reads the value until the no-show feature
-- ships, so applying this first is safe. It MUST be applied before that code
-- deploys, or every no-show write fails.
--
-- Safe to re-run. Run it on its own (ALTER TYPE ... ADD VALUE cannot share a
-- transaction with statements that use the new value).
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';
```

Run: `npx prisma generate` (updates the TypeScript types only — it does not touch any database).
Expected: "Generated Prisma Client".

- [ ] **Step 4: Create the shared status-name helper**

Create `src/lib/appointment-status.ts`:

```ts
import type { AppointmentStatus } from "@prisma/client";

/**
 * The lowercase, hyphenated name used wherever an appointment status is shown
 * or styled (NO_SHOW → "no-show"). Plain `.toLowerCase()` would leak the
 * underscore ("no_show") into badges and copy.
 */
export function appointmentStatusKey(status: AppointmentStatus) {
  return status.toLowerCase().replace("_", "-");
}
```

- [ ] **Step 5: Update the calendar status type and mappers**

In `src/lib/calendar.ts`:

Line 13 becomes:

```ts
export type CalendarAppointmentStatus =
  | "confirmed"
  | "pending"
  | "cancelled"
  | "completed"
  | "no-show";
```

Change `function toCalendarStatus(` to `export function toCalendarStatus(` and `function toCalendarTone(` to `export function toCalendarTone(`. In `toCalendarStatus`, insert before the `if (status === "COMPLETED") {\n    return "completed";` block:

```ts
  if (status === "NO_SHOW") {
    return "no-show";
  }

```

In `toCalendarTone`, insert before the `if (status === "COMPLETED") {\n    return "primary";` block:

```ts
  if (status === "NO_SHOW") {
    return "muted";
  }

```

In `toPrismaAppointmentStatus`, insert before the `if (status === "completed") {` block:

```ts
  if (status === "no-show") {
    return "NO_SHOW" as const;
  }

```

- [ ] **Step 6: Stop `hydrateAppointment` from duplicating (and mis-mapping) the status**

In `src/app/(workspace)/calendar/actions.ts`, add `toCalendarStatus` and `toCalendarTone` to the existing `@/lib/calendar` import (next to `toPrismaAppointmentStatus`). Replace the inline status ternary and tone (lines 142–169) so the function ends:

```ts
  const status = toCalendarStatus(appointment.status);

  return {
    id: appointment.id,
    clientId: appointment.clientId,
    clientName: appointment.client.name,
    service: appointment.title,
    staffMemberId: appointment.staffMemberId ?? undefined,
    staffName: appointment.staffMember?.name ?? "Workspace staff",
    date: formatZonedDateKey(appointment.startAt),
    startTime: formatZonedTime24(appointment.startAt),
    endTime: formatZonedTime24(appointment.endAt),
    notes: appointment.notes ?? "",
    status,
    tone: toCalendarTone(appointment.status),
  } satisfies CalendarAppointment;
```

(The old inline ternary would have silently turned a NO_SHOW row into `"confirmed"`. The two shared mappers give identical results for the four old statuses.)

- [ ] **Step 7: Dashboard and mobile mappers**

`src/lib/dashboard.ts` line 14:

```ts
export type DashboardAppointmentStatus =
  | "confirmed"
  | "pending"
  | "cancelled"
  | "completed"
  | "no-show";
```

In `toDashboardStatus`, insert before the `if (status === "COMPLETED") {\n    return "completed";` block:

```ts
  if (status === "NO_SHOW") {
    return "no-show";
  }

```

`src/lib/mobile/serializers.ts`: above `serializeAppointment`, add

```ts
// The mobile app only knows four statuses. A no-show is a slot that didn't
// happen, so it reads as cancelled there until the app grows its own state.
function toMobileAppointmentStatus(status: AppointmentForMobile["status"]): MobileAppointmentStatus {
  return status === "NO_SHOW" ? "cancelled" : (status.toLowerCase() as MobileAppointmentStatus);
}
```

and replace line 117–118 (`// The enum values map 1:1 …` / `status: appointment.status.toLowerCase() as MobileAppointmentStatus,`) with:

```ts
    status: toMobileAppointmentStatus(appointment.status),
```

- [ ] **Step 8: Tone maps**

`src/lib/status-tone.ts` — add a fifth value and update the header comment count ("the 4 values" → "the 5 values"):

```ts
  cancelled: "var(--destructive)",
  noShow: "#8b5cf6", // Tailwind violet-500, matches bg-violet-500
} as const;
```

`src/components/reports/overview-tab.tsx` `statusColor`, add as the first check:

```ts
  if (normalized.includes("no-show")) return APPOINTMENT_STATUS_COLORS.noShow;
```

`src/components/calendar/calendar-workspace.tsx`: add `"no-show": "bg-violet-500",` to `statusDotClasses` and `"no-show": "bg-violet-50 text-violet-800",` to `monthChipClasses`.

`src/components/dashboard/dashboard-overview.tsx`: add `"no-show": "bg-violet-500",` to `statusDotStyles` and `"no-show": "text-violet-600",` to `statusTextStyles`.

- [ ] **Step 9: Badges and copy that lowercase the raw enum**

`src/components/staff/staff-details-page.tsx` `AppointmentStatusBadge`: change the first line to `const normalized = status.toLowerCase().replace("_", "-");` and add inside `cn(`:

```ts
        normalized === "no-show" && "bg-violet-100 text-violet-700",
```

`src/components/clients/client-details-page.tsx` `StatusBadge`: same first-line change, and add `normalized === "no-show" && "bg-violet-100 text-violet-700",` to its `cn(` list. At line 916 replace `<StatusBadge status={appointment.status.toLowerCase()} />` with `<StatusBadge status={appointmentStatusKey(appointment.status)} />` and add `import { appointmentStatusKey } from "@/lib/appointment-status";`.

`src/lib/clients.ts`: add the same import; line 341 `${appointment.status.toLowerCase()}` → `${appointmentStatusKey(appointment.status)}`; line 504 `status: appointment.status.toLowerCase(),` → `status: appointmentStatusKey(appointment.status),`.

`src/lib/staff.ts` line 434 `status: appointment.status,` → `status: appointmentStatusKey(appointment.status),` (add the import).

- [ ] **Step 10: Run tests and the type-checker**

Run: `npx vitest run src/lib/calendar.test.ts src/lib/mobile/serializers.test.ts src/lib/appointment-status.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean. If it reports a missing key in a `Record<…Status, …>` or a switch, it is one this plan missed — add the `no-show` entry the same way as above (violet), then re-run.

- [ ] **Step 11: Commit**

```bash
git checkout -b feat/no-show-status origin/main
git add prisma/schema.prisma prisma/no-show-status-migration.sql src/lib src/app src/components
git commit -m "feat: add a no-show appointment status and make every status mapper handle it" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Give no-shows the right meaning in existing calculations

A no-show is a **finalized** visit that was **not completed** and **not attended**: it lowers completion rates, does not count as a visit that happened, and must never get a reminder.

**Files:**
- Modify: `src/lib/staff.ts` (`calculateCompletionRate`, line 352), `src/lib/staff-data.ts` (lines 63–76)
- Modify: `src/lib/dashboard-data.ts` (lines 32–83), `src/lib/dashboard.ts` (lines 140–151, 395–400), `src/app/(workspace)/dashboard/page.tsx` (lines 272–280)
- Modify: `src/lib/clients.ts` (line 647), `src/lib/reminders.ts` (line 103)
- Test: `src/lib/staff.test.ts`

**Interfaces:**
- Consumes: Task 1's regenerated `AppointmentStatus`.
- Produces: `calculateCompletionRate` exported from `src/lib/staff.ts`; `DashboardAppointmentAggregates.recentNoShow: number`.

- [ ] **Step 1: Write the failing test**

In `src/lib/staff.test.ts` add `calculateCompletionRate` to the `@/lib/staff` import list and append:

```ts
describe("calculateCompletionRate", () => {
  it("counts a no-show as a finalized visit that was not completed", () => {
    expect(
      calculateCompletionRate([
        { status: "COMPLETED" },
        { status: "COMPLETED" },
        { status: "NO_SHOW" },
        { status: "CANCELLED" },
      ])
    ).toBe(50);
  });

  it("ignores visits that are not finalized yet", () => {
    expect(calculateCompletionRate([{ status: "CONFIRMED" }, { status: "PENDING" }])).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/staff.test.ts -t "calculateCompletionRate"`
Expected: FAIL — `calculateCompletionRate` is not exported.

- [ ] **Step 3: Staff completion rate**

`src/lib/staff.ts`: `function calculateCompletionRate(` → `export function calculateCompletionRate(`, and the `finalized` filter becomes:

```ts
  const finalized = appointments.filter(
    (appointment) =>
      appointment.status === "COMPLETED" ||
      appointment.status === "CANCELLED" ||
      appointment.status === "NO_SHOW"
  );
```

`src/lib/staff-data.ts`, replace lines 63–76 (the `finalized` map through the completion-rate assignment) with:

```ts
  // A no-show is a finalized visit that wasn't completed, same as a cancellation.
  const finalized = new Map<string, { completed: number; missed: number }>();
  for (const row of completionRows) {
    if (!row.staffMemberId) continue;
    const agg = finalized.get(row.staffMemberId) ?? { completed: 0, missed: 0 };
    if (row.status === "COMPLETED") agg.completed += row._count._all;
    else if (row.status === "CANCELLED" || row.status === "NO_SHOW") agg.missed += row._count._all;
    finalized.set(row.staffMemberId, agg);
  }
  for (const [id, agg] of finalized) {
    const total = agg.completed + agg.missed;
    // Matches calculateCompletionRate: one-decimal percentage.
    ensure(id).completionRate =
      total > 0 ? Math.round((agg.completed / total) * 1000) / 10 : 0;
  }
```

- [ ] **Step 4: Dashboard rates and visit chart**

`src/lib/dashboard-data.ts`: in the raw SQL day-bucket query change `AND "status" <> 'CANCELLED'` to `AND "status" NOT IN ('CANCELLED', 'NO_SHOW')` (a no-show didn't attend, so it is not a visit in the Visits chart or its totals). After `recentCancelled` (line 74) add:

```ts
  const recentNoShow =
    statusCounts.find((row) => row.status === "NO_SHOW")?._count._all ?? 0;
```

and include `recentNoShow,` in the returned object after `recentCancelled,`.

`src/lib/dashboard.ts`: in `DashboardAppointmentAggregates` add after `recentCancelled`:

```ts
  /** NO_SHOW in the rolling 30-day window. */
  recentNoShow: number;
```

and change lines 395–396 to:

```ts
  const recentFinal =
    appointmentAggregates.recentCompleted +
    appointmentAggregates.recentCancelled +
    appointmentAggregates.recentNoShow;
```

`src/app/(workspace)/dashboard/page.tsx` fallback object: add `recentNoShow: 0,` after `recentCancelled: 0,`.

- [ ] **Step 5: Client profile and reminders**

`src/lib/clients.ts` line 647: `noShows: 0,` → `noShows: appointmentCount("NO_SHOW"),`.

`src/lib/reminders.ts` lines 103–105: change

```ts
      status: {
        not: "CANCELLED",
      },
```

to

```ts
      // A no-show has already started, so it never reaches a future reminder
      // window — excluded explicitly so that can't change by accident.
      status: {
        notIn: ["CANCELLED", "NO_SHOW"],
      },
```

- [ ] **Step 6: Run tests and type-check**

Run: `npx vitest run src/lib/staff.test.ts src/lib/dashboard.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

(The raw-SQL and Prisma-query edits in Steps 4–5 have no unit tests — they are one-line predicate changes that need a database. They are exercised in Task 6's browser QA: a marked no-show must disappear from the Visits chart and lower the completion rate.)

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "fix: count no-shows as finalized-not-completed and never as attended visits" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Reports — a real no-show rate

**Files:**
- Modify: `src/lib/reports.ts` (lines 62, 230–238, 471–476, 596–598, 776–836, 887–899, 1777–1780, 1869, 2161–2172)
- Modify: `src/components/reports/overview-tab.tsx` (lines 201–215, 598–623)
- Test: `src/lib/reports.test.ts`

**Interfaces:**
- Consumes: Task 1's `NO_SHOW` enum value.
- Produces: `ReportDetailRowKey` gains `"noShow"`; `PeriodStats.noShowCount` / `noShowRate`; a `"No-show"` entry in `diagnostics.statusMix` **only when the period has a no-show**; a `noShow` row in `operationalDetail` only when `noShowCount > 0`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/reports.test.ts`:

```ts
describe("buildReportsViewFromWorkspace — no-shows", () => {
  function reportFor(appointments: ReturnType<typeof appt>[]) {
    return buildReportsViewFromWorkspace({
      business: { name: "No-show Clinic" },
      appointments,
      clients: [],
      clientMix: { active: 0, atRisk: 0, inactive: 0, archived: 0 },
      messages: [],
      businessHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        isOpen: true,
        startTime: "08:00",
        endTime: "17:00",
      })),
      scheduleBlocks: [],
      staffMembers: [
        { id: "s1", name: "Dr. One", role: "Dentist", status: "ACTIVE", isActive: true },
      ],
      conversations: [],
      aiSnapshots: [],
      now,
      timeZone: "UTC",
    });
  }

  it("treats a no-show as a finalized visit: it lowers completion and gets its own rate", () => {
    const daily = reportFor([
      appt(0, 8, "COMPLETED"),
      appt(0, 9, "COMPLETED"),
      appt(0, 10, "NO_SHOW"),
      appt(0, 11, "CANCELLED"),
    ]).periods.daily;

    expect(daily.metrics.find((metric) => metric.label === "Completion rate")?.value).toBe("50.0%");
    expect(daily.operationalDetail.find((row) => row.key === "noShow")?.value).toBe("25.0%");
    // Lost-slot rate stays cancellations only.
    expect(daily.operationalDetail.find((row) => row.key === "lostSlot")?.value).toBe("25.0%");
  });

  it("adds a No-show slice to the status mix only when there is one", () => {
    const withNoShow = reportFor([appt(0, 8, "COMPLETED"), appt(0, 9, "NO_SHOW")]).periods.daily;
    const without = reportFor([appt(0, 8, "COMPLETED"), appt(0, 9, "CANCELLED")]).periods.daily;

    expect(withNoShow.diagnostics.statusMix.map((item) => item.label)).toEqual([
      "Completed",
      "Confirmed",
      "Pending",
      "Cancelled",
      "No-show",
    ]);
    expect(withNoShow.diagnostics.statusMix.find((item) => item.label === "No-show")?.count).toBe(1);
    expect(without.diagnostics.statusMix.map((item) => item.label)).toEqual([
      "Completed",
      "Confirmed",
      "Pending",
      "Cancelled",
    ]);
    expect(without.operationalDetail.some((row) => row.key === "noShow")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/reports.test.ts -t "no-shows"`
Expected: FAIL — no `noShow` row / no `No-show` slice.

- [ ] **Step 3: Stats, labels, and finalized definition**

`src/lib/reports.ts`:

Line 62: `export type ReportDetailRowKey = "lostSlot" | "noShow" | "repeatVisit" | "followUp";`

In `type PeriodStats` after `lostSlotRate: number;` add `noShowCount: number;` and `noShowRate: number;`.

`statusLabel` — add `if (status === "NO_SHOW") return "No-show";` after the `CANCELLED` line.

`isFinalizedStatus` becomes:

```ts
function isFinalizedStatus(status: Appointment["status"]) {
  return status === "COMPLETED" || status === "CANCELLED" || status === "NO_SHOW";
}
```

(`isBookedStatus` deliberately stays `status !== "CANCELLED"`: a no-show was booked demand and held a slot, so it still counts toward booking patterns and *scheduled* utilization. Record this in the code comment on `isBookedStatus`: `// No-shows stay booked: the demand and the held slot were real.`)

In the stats builder, after the `cancelledAppointments` filter (line 782–784) add:

```ts
  const noShowAppointments = scopedAppointments.filter(
    (appointment) => appointment.status === "NO_SHOW"
  );
```

and in the returned object after `lostSlotRate: …,` (line 833–836) add:

```ts
    noShowCount: noShowAppointments.length,
    noShowRate:
      finalizedAppointments.length > 0
        ? (noShowAppointments.length / finalizedAppointments.length) * 100
        : 0,
```

- [ ] **Step 4: Status mix, delta, detail row**

Replace the `statusMix` construction (lines 887–899) with:

```ts
  // No-show only appears once one has been recorded, so a workspace that never
  // uses it sees the same four-slice donut as before.
  const statusOrder: Array<Appointment["status"]> = ["COMPLETED", "CONFIRMED", "PENDING", "CANCELLED"];
  if (scopedAppointments.some((appointment) => appointment.status === "NO_SHOW")) {
    statusOrder.push("NO_SHOW");
  }
  const statusMix = statusOrder.map((status) => {
    const count = scopedAppointments.filter((appointment) => appointment.status === status).length;

    return {
      label: statusLabel(status),
      count,
      share: formatPercent((count / totalAppointments) * 100),
    };
  });
```

In `buildMetrics`, after `lostSlotDelta` (line 1777–1780) add:

```ts
  const noShowDelta =
    current.finalizedCount > 0 && previous.finalizedCount > 0
      ? formatPointChange(current.noShowRate, previous.noShowRate, { inverse: true })
      : unmeasuredDelta();
```

and after `lostSlot: lostSlotDelta,` (line 1869) add `noShow: noShowDelta,`.

In `buildOperationalDetail`, after the `lostSlot` block (line 2163–2172) add:

```ts
  if (current.noShowCount > 0) {
    rows.push({
      key: "noShow",
      label: "No-show rate",
      value: formatPercent(current.noShowRate),
      delta: deltas.noShow.delta,
      trend: deltas.noShow.trend,
      helper: "",
    });
  }
```

- [ ] **Step 5: Reports UI**

`src/components/reports/overview-tab.tsx`:

At both places that read the detail rows (lines 203–205 and 600–602) add:

```ts
  const noShowRow = period.operationalDetail.find((row) => row.key === "noShow");
```

In `completionDetailParts` (line 208–215), add after the lost-slot line:

```ts
    noShowRow?.value ? `No-show rate: ${noShowRow.value} of finalized visits were no-shows.` : null,
```

In `HighlightsCard`, add after the `lostSlotRow` entry and cap the list at five:

```ts
    noShowRow && noShowRow.value
      ? { title: "No-show rate", detail: `${noShowRow.value} of finalized visits were no-shows.` }
      : null,
```

and change `].filter((item): item is { title: string; detail: string } => Boolean(item));` to

```ts
  ]
    .filter((item): item is { title: string; detail: string } => Boolean(item))
    // AGENTS.md locks Highlights at five tiles; with a sixth, the last one drops.
    .slice(0, 5);
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/reports.test.ts`
Expected: PASS, **including the unchanged characterization snapshot** (the fixture has no no-shows). If the snapshot fails, a new field leaked into the default view model — fix the code, never `-u` the snapshot.

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: report a real no-show rate and count no-shows as finalized visits" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Server — Pro-gated no-show writes and the quick attendance action

**Files:**
- Modify: `src/lib/appointments-shared.ts` (constants after line 96; new function after `cancelAppointmentCore`, line 304)
- Modify: `src/app/(workspace)/calendar/actions.ts` (imports lines 8–31; save check after line 193; new action after `cancelAppointmentAction`, line 549)
- Test: `src/lib/appointments-shared.test.ts`, `src/app/(workspace)/calendar/actions.test.ts`

**Interfaces:**
- Consumes: `isProBusinessPlan(plan: BusinessPlan): boolean` from `@/lib/billing`; `toPrismaAppointmentStatus` from Task 1.
- Produces:
  - `APPOINTMENT_NOT_STARTED_ERROR`, `APPOINTMENT_CANCELLED_NO_SHOW_ERROR`, `NO_SHOW_PLAN_ERROR` (strings, exported from `appointments-shared.ts`)
  - `recordAppointmentAttendanceCore(args: { id: string; businessId: string; attended: boolean; now?: Date }): Promise<AppointmentMutationOutcome>`
  - `recordAppointmentAttendanceAction(appointmentId: string, attended: boolean): Promise<RecordAttendanceResult>` where `RecordAttendanceResult = { ok: boolean; error?: string; status?: CalendarAppointmentStatus }`

- [ ] **Step 1: Write the failing core tests**

In `src/lib/appointments-shared.test.ts` add `APPOINTMENT_CANCELLED_NO_SHOW_ERROR`, `APPOINTMENT_NOT_STARTED_ERROR`, and `recordAppointmentAttendanceCore` to the `./appointments-shared` import list, and append:

```ts
describe("recordAppointmentAttendanceCore", () => {
  const NOW = new Date("2026-06-01T12:00:00.000Z");
  const STARTED = new Date("2026-06-01T09:00:00.000Z");
  const FUTURE = new Date("2026-06-02T09:00:00.000Z");

  function mockAttendanceMiss(existing: { status: string; startAt: Date } | null) {
    mocks.appointment.updateMany.mockResolvedValue({ count: 0 });
    mocks.appointment.findFirst.mockResolvedValue(existing ? { ...RECORD, ...existing } : null);
  }

  it("marks a started appointment as a no-show and refreshes lastVisitAt", async () => {
    mockGuardHit();

    const result = await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW });

    expect(result).toEqual({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: "staff_1",
      changed: true,
    });
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        ...WHERE,
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
        startAt: { lte: NOW },
      },
      data: { status: "NO_SHOW" },
    });
    expect(mocks.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "client_1", businessId: "biz_1" } })
    );
  });

  it("undoes a no-show back to completed", async () => {
    mockGuardHit();

    const result = await recordAppointmentAttendanceCore({ ...WHERE, attended: true, now: NOW });

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith({
      where: { ...WHERE, status: "NO_SHOW" },
      data: { status: "COMPLETED" },
    });
  });

  it("is a no-op success when the appointment is already in the requested state", async () => {
    mockAttendanceMiss({ status: "NO_SHOW", startAt: STARTED });
    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW })).toMatchObject({
      ok: true,
      changed: false,
    });

    mockAttendanceMiss({ status: "COMPLETED", startAt: STARTED });
    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: true, now: NOW })).toMatchObject({
      ok: true,
      changed: false,
    });
    expect(mocks.client.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a no-show for an appointment that has not started", async () => {
    mockAttendanceMiss({ status: "CONFIRMED", startAt: FUTURE });

    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW })).toEqual({
      ok: false,
      status: 409,
      error: APPOINTMENT_NOT_STARTED_ERROR,
    });
  });

  it("refuses to mark a cancelled appointment as a no-show", async () => {
    mockAttendanceMiss({ status: "CANCELLED", startAt: STARTED });

    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW })).toEqual({
      ok: false,
      status: 409,
      error: APPOINTMENT_CANCELLED_NO_SHOW_ERROR,
    });
  });

  it("reports a plain conflict when the row changed underneath the guard", async () => {
    mockAttendanceMiss({ status: "CONFIRMED", startAt: STARTED });

    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW })).toEqual({
      ok: false,
      status: 409,
      error: APPOINTMENT_CONFLICT_ERROR,
    });
  });

  it("returns 404 when the appointment is not in this workspace", async () => {
    mockAttendanceMiss(null);

    expect(await recordAppointmentAttendanceCore({ ...WHERE, attended: false, now: NOW })).toEqual({
      ok: false,
      status: 404,
      error: APPOINTMENT_NOT_FOUND_ERROR,
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/appointments-shared.test.ts -t "recordAppointmentAttendanceCore"`
Expected: FAIL — `recordAppointmentAttendanceCore` is not exported.

- [ ] **Step 3: Implement the core**

In `src/lib/appointments-shared.ts`, after `APPOINTMENT_NOT_FOUND_ERROR` (line 96) add:

```ts
// Marking a no-show is only meaningful once the appointment time has come.
export const APPOINTMENT_NOT_STARTED_ERROR =
  "You can only mark an appointment as a no-show after it has started.";

export const APPOINTMENT_CANCELLED_NO_SHOW_ERROR =
  "A cancelled appointment can't be marked as a no-show.";

// Shown to a workspace that isn't on Pro. Plain product language, no plan
// internals — the upgrade path lives in Settings.
export const NO_SHOW_PLAN_ERROR = "No-show tracking is part of the Pro plan.";
```

After `cancelAppointmentCore` (ends line 304) add:

```ts
/**
 * Record whether a patient came, via compare-and-set (same discipline as
 * cancelAppointmentCore): the allowed source states and the "has started"
 * rule live in the update's own WHERE clause, so a concurrent status change —
 * most commonly the completePastConfirmedAppointments sweep — can't be
 * silently overwritten.
 *
 * - `attended: false` → NO_SHOW, from PENDING / CONFIRMED / COMPLETED (the
 *   sweep completes a visit as soon as it ends, so COMPLETED → NO_SHOW is the
 *   normal correction), and only once the appointment has started.
 * - `attended: true` → COMPLETED, from NO_SHOW only (the undo).
 *
 * The status write and the client's lastVisitAt refresh are one transaction:
 * a no-show is not a visit, so the last-visit date can move back.
 */
export async function recordAppointmentAttendanceCore(args: {
  id: string;
  businessId: string;
  attended: boolean;
  now?: Date;
}): Promise<AppointmentMutationOutcome> {
  const { id, businessId, attended, now = new Date() } = args;
  const where = { id, businessId };

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.appointment.updateMany({
      where: attended
        ? { ...where, status: "NO_SHOW" }
        : {
            ...where,
            status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
            startAt: { lte: now },
          },
      data: { status: attended ? "COMPLETED" : "NO_SHOW" },
    });

    if (count === 0) {
      // The guarded update didn't apply — a read-only lookup (no race risk)
      // tells the caller why.
      const existing = await tx.appointment.findFirst({
        where,
        select: { id: true, clientId: true, staffMemberId: true, status: true, startAt: true },
      });

      if (!existing) {
        return { ok: false, status: 404, error: APPOINTMENT_NOT_FOUND_ERROR };
      }

      const target = attended ? "COMPLETED" : "NO_SHOW";

      if (existing.status === target) {
        // Already in the requested state: nothing to write, nothing to announce.
        return {
          ok: true,
          appointmentId: existing.id,
          clientId: existing.clientId,
          staffMemberId: existing.staffMemberId,
          changed: false,
        };
      }

      if (!attended && existing.status === "CANCELLED") {
        return { ok: false, status: 409, error: APPOINTMENT_CANCELLED_NO_SHOW_ERROR };
      }

      if (!attended && existing.startAt.getTime() > now.getTime()) {
        return { ok: false, status: 409, error: APPOINTMENT_NOT_STARTED_ERROR };
      }

      // Anything else means the row changed between the guard and this read.
      return { ok: false, status: 409, error: APPOINTMENT_CONFLICT_ERROR };
    }

    const updated = await tx.appointment.findFirstOrThrow({
      where: { id },
      select: { id: true, clientId: true, staffMemberId: true },
    });

    await refreshClientLastVisitAt(updated.clientId, businessId, tx);

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

Run: `npx vitest run src/lib/appointments-shared.test.ts`
Expected: PASS (all cancel/delete tests plus the new seven).

- [ ] **Step 4: Write the failing action tests**

In `src/app/(workspace)/calendar/actions.test.ts`:

1. In the `vi.hoisted` block add `const recordAttendance = vi.fn();` and include `recordAttendance,` in the returned object.
2. In the `vi.mock("@/lib/appointments-shared", …)` factory add, next to `cancelAppointmentCore: vi.fn(),`:

```ts
    APPOINTMENT_NOT_STARTED_ERROR: actual.APPOINTMENT_NOT_STARTED_ERROR,
    NO_SHOW_PLAN_ERROR: actual.NO_SHOW_PLAN_ERROR,
    recordAppointmentAttendanceCore: mocks.recordAttendance,
```

3. Add `recordAppointmentAttendanceAction` to the `./actions` import and `APPOINTMENT_NOT_STARTED_ERROR`, `NO_SHOW_PLAN_ERROR` to the `@/lib/appointments-shared` import.
4. Change `const BUSINESS = { id: "biz_1" };` to `const BUSINESS = { id: "biz_1", plan: "PRO" as const };`.
5. Append:

```ts
const NO_SHOW_ROW = {
  id: "appt_1",
  clientId: "client_1",
  client: { id: "client_1", name: "Test Patient" },
  staffMemberId: null,
  staffMember: null,
  title: "Checkup",
  startAt: new Date("2026-06-01T09:00:00Z"),
  endAt: new Date("2026-06-01T09:30:00Z"),
  notes: null,
  status: "NO_SHOW" as const,
};

describe("saveAppointmentAction — no-show status", () => {
  const NO_SHOW_PAYLOAD: SaveAppointmentPayload = { ...PAYLOAD, status: "no-show" };

  beforeEach(() => {
    mocks.appointment.updateMany.mockResolvedValue({ count: 1 });
    mocks.appointment.findUniqueOrThrow.mockResolvedValue(NO_SHOW_ROW);
  });

  it("saves a no-show for a started appointment on Pro and reads it back as no-show", async () => {
    const result = await saveAppointmentAction(NO_SHOW_PAYLOAD);

    expect(result.ok).toBe(true);
    expect(result.appointment?.status).toBe("no-show");
    expect(mocks.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "NO_SHOW" }) })
    );
    expect(mocks.refreshClientLastVisitAt).toHaveBeenCalled();
  });

  it("refuses to set a no-show on a workspace that isn't on Pro", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "BASIC" }, user: {} });

    expect(await saveAppointmentAction(NO_SHOW_PAYLOAD)).toEqual({ ok: false, error: NO_SHOW_PLAN_ERROR });
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("still lets a Basic workspace save an existing no-show without changing its status", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "BASIC" }, user: {} });
    mocks.appointment.findFirst.mockResolvedValue({ ...EXISTING, status: "NO_SHOW" });

    const result = await saveAppointmentAction({ ...NO_SHOW_PAYLOAD, baselineStatus: "no-show" });

    expect(result.ok).toBe(true);
  });

  it("refuses a no-show for an appointment that has not started", async () => {
    expect(await saveAppointmentAction({ ...NO_SHOW_PAYLOAD, date: "2099-01-01" })).toEqual({
      ok: false,
      error: APPOINTMENT_NOT_STARTED_ERROR,
    });
    expect(mocks.appointment.updateMany).not.toHaveBeenCalled();
  });
});

describe("recordAppointmentAttendanceAction", () => {
  it("refuses a workspace that isn't on Pro without touching the appointment", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: { id: "biz_1", plan: "BASIC" }, user: {} });

    expect(await recordAppointmentAttendanceAction("appt_1", false)).toEqual({
      ok: false,
      error: NO_SHOW_PLAN_ERROR,
    });
    expect(mocks.recordAttendance).not.toHaveBeenCalled();
  });

  it("marks a no-show, refreshes every surface, and reports the new status", async () => {
    mocks.recordAttendance.mockResolvedValue({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: "staff_1",
      changed: true,
    });

    expect(await recordAppointmentAttendanceAction("appt_1", false)).toEqual({ ok: true, status: "no-show" });
    expect(mocks.recordAttendance).toHaveBeenCalledWith({
      id: "appt_1",
      businessId: "biz_1",
      attended: false,
    });
    expect(mocks.revalidateCalendarSurfaces).toHaveBeenCalledWith(["client_1"], ["staff_1"]);
  });

  it("undoes a no-show back to completed", async () => {
    mocks.recordAttendance.mockResolvedValue({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: null,
      changed: true,
    });

    expect(await recordAppointmentAttendanceAction("appt_1", true)).toEqual({ ok: true, status: "completed" });
  });

  it("skips revalidation when nothing changed", async () => {
    mocks.recordAttendance.mockResolvedValue({
      ok: true,
      appointmentId: "appt_1",
      clientId: "client_1",
      staffMemberId: null,
      changed: false,
    });

    await recordAppointmentAttendanceAction("appt_1", false);

    expect(mocks.revalidateCalendarSurfaces).not.toHaveBeenCalled();
  });

  it("passes the core's reason through, and words a missing appointment for this workspace", async () => {
    mocks.recordAttendance.mockResolvedValueOnce({ ok: false, status: 409, error: APPOINTMENT_NOT_STARTED_ERROR });
    expect(await recordAppointmentAttendanceAction("appt_1", false)).toEqual({
      ok: false,
      error: APPOINTMENT_NOT_STARTED_ERROR,
    });

    mocks.recordAttendance.mockResolvedValueOnce({ ok: false, status: 404, error: "Appointment not found." });
    expect(await recordAppointmentAttendanceAction("appt_1", false)).toEqual({
      ok: false,
      error: "Appointment not found in this clinic workspace.",
    });
  });
});
```

- [ ] **Step 5: Run them to verify they fail**

Run: `npx vitest run "src/app/(workspace)/calendar/actions.test.ts"`
Expected: FAIL — `recordAppointmentAttendanceAction` is not exported, and the save path accepts a Basic no-show.

- [ ] **Step 6: Implement the save checks and the action**

In `src/app/(workspace)/calendar/actions.ts`:

Add `APPOINTMENT_NOT_STARTED_ERROR`, `NO_SHOW_PLAN_ERROR`, and `recordAppointmentAttendanceCore` to the `@/lib/appointments-shared` import (lines 8–20 — keep the existing names) and add `import { isProBusinessPlan } from "@/lib/billing";`.

In `saveAppointmentAction`, immediately after the `if (!payload.clientId || … endAt <= startAt) { … }` block (ends line 193), insert:

```ts
  // No-show is a Pro feature. Setting it needs Pro; an existing no-show on a
  // workspace that has since dropped to Basic can still be edited as long as its
  // status isn't being changed. It can only be recorded once the time has come.
  if (payload.status === "no-show") {
    if (payload.baselineStatus !== "no-show" && !isProBusinessPlan(business.plan)) {
      return { ok: false, error: NO_SHOW_PLAN_ERROR };
    }

    if (startAt.getTime() > Date.now()) {
      return { ok: false, error: APPOINTMENT_NOT_STARTED_ERROR };
    }
  }
```

After `cancelAppointmentAction` (ends line 549) add:

```ts
export type RecordAttendanceResult = {
  ok: boolean;
  error?: string;
  /** The appointment's new status, so the calendar can update in place. */
  status?: CalendarAppointmentStatus;
};

/**
 * Quick "did they come?" correction from the calendar popover. Lighter than the
 * full edit save — no business-hours or conflict re-validation, because only the
 * status changes. Pro only; the plan is re-checked here, not just in the UI.
 */
export async function recordAppointmentAttendanceAction(
  appointmentId: string,
  attended: boolean
): Promise<RecordAttendanceResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const business = context.business;

  if (!isProBusinessPlan(business.plan)) {
    return { ok: false, error: NO_SHOW_PLAN_ERROR };
  }

  const outcome = await recordAppointmentAttendanceCore({
    id: appointmentId,
    businessId: business.id,
    attended,
  });

  if (!outcome.ok) {
    return {
      ok: false,
      error:
        outcome.status === 404
          ? "Appointment not found in this clinic workspace."
          : outcome.error,
    };
  }

  if (outcome.changed) {
    revalidateCalendarSurfaces([outcome.clientId], [outcome.staffMemberId]);
  }

  return { ok: true, status: attended ? "completed" : "no-show" };
}
```

- [ ] **Step 7: Run tests and gates**

Run: `npx vitest run src/lib/appointments-shared.test.ts "src/app/(workspace)/calendar/actions.test.ts"`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat: Pro-gated no-show writes and a quick mark-attendance action" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: UI — the No-show option and the quick-view button

Nothing here is unit-tested (there is no component-test setup in this repo); it is verified by `tsc`, `lint`, and the browser QA in Task 6.

**Files:**
- Modify: `src/components/calendar/new-appointment-form.tsx` (props lines 38–47; `statusOptions` lines 49–54; component params lines 79–88; `editStatusOptions` lines 127–130)
- Modify: `src/app/(workspace)/calendar/[appointmentId]/edit/page.tsx` (`<NewAppointmentForm` at line 114)
- Modify: `src/app/(workspace)/calendar/page.tsx` (line 107–113)
- Modify: `src/components/calendar/calendar-workspace.tsx` (imports lines 4–50; props lines 55–61; `AppointmentQuickView` lines 361–453; component lines 455–470, 591–594, 892–898)

**Interfaces:**
- Consumes: `recordAppointmentAttendanceAction(appointmentId: string, attended: boolean): Promise<RecordAttendanceResult>` (Task 4); `isProBusinessPlan` from `@/lib/billing`.
- Produces: `CalendarWorkspace` prop `canRecordNoShows: boolean`; `NewAppointmentForm` prop `canRecordNoShows?: boolean`.

- [ ] **Step 1: The edit form's Status dropdown**

`src/components/calendar/new-appointment-form.tsx`:

Add to `NewAppointmentFormProps`: `canRecordNoShows?: boolean;` and destructure `canRecordNoShows = false,` in the component parameters.

`statusOptions` becomes:

```ts
const statusOptions: CalendarAppointmentStatus[] = [
  "confirmed",
  "pending",
  "cancelled",
  "completed",
  "no-show",
];
```

Replace `editStatusOptions` (and its comment) with:

```ts
  // "Cancelled" isn't offered on a completed visit (the server refuses it), and
  // "No-show" is a Pro option — but a visit that is already a no-show keeps it
  // listed so the dropdown never shows a blank. No useMemo: baselineStatus is
  // frozen at mount, so this can never recompute to a different value anyway.
  const editStatusOptions = statusOptions.filter(
    (option) =>
      (option !== "cancelled" || baselineStatus !== "completed") &&
      (option !== "no-show" || canRecordNoShows || baselineStatus === "no-show")
  );
```

`src/app/(workspace)/calendar/[appointmentId]/edit/page.tsx`: add `import { isProBusinessPlan } from "@/lib/billing";` and pass `canRecordNoShows={isProBusinessPlan(business.plan)}` to `<NewAppointmentForm` (the `business` variable is already in scope from `requireCurrentWorkspace`, line 15). The new-booking page needs nothing: the Status field only shows when editing.

- [ ] **Step 2: Pass the plan into the calendar**

`src/app/(workspace)/calendar/page.tsx`: add `import { isProBusinessPlan } from "@/lib/billing";` and change the render to:

```tsx
    <CalendarWorkspace
      initialView={initialView}
      initialRange={month.range}
      today={todayKey}
      canRecordNoShows={isProBusinessPlan(business.plan)}
    />
```

- [ ] **Step 3: The quick-view button**

`src/components/calendar/calendar-workspace.tsx`:

Add `recordAppointmentAttendanceAction` to the `@/app/(workspace)/calendar/actions` import (line 33), and `canRecordNoShows: boolean;` to `CalendarWorkspaceProps` with the comment `/** Pro workspaces can mark a visit as a no-show (and undo it) from the quick view. */`.

Add a type above `AppointmentQuickView`:

```ts
type AttendanceAction = { attended: boolean; label: string };
```

Change `AppointmentQuickView`'s props to:

```tsx
function AppointmentQuickView({
  appointment,
  anchorRect,
  onClose,
  attendanceAction,
  onRecordAttendance,
}: {
  appointment: CalendarAppointment;
  anchorRect: DOMRect;
  onClose: () => void;
  /** Present only for a Pro workspace and a visit whose day has come. */
  attendanceAction: AttendanceAction | null;
  /** Resolves to an error message, or null when it worked (the parent then closes this). */
  onRecordAttendance: (attended: boolean) => Promise<string | null>;
}) {
```

After the `const containerRef = useRef<HTMLDivElement>(null);` line add:

```tsx
  const [busy, setBusy] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");

  async function handleAttendance(attended: boolean) {
    setBusy(true);
    setAttendanceError("");

    const message = await onRecordAttendance(attended);

    // On success the parent closes this popover, so only a failure needs state.
    if (message) {
      setAttendanceError(message);
      setBusy(false);
    }
  }
```

Replace the trailing `<Link href={\`/calendar/${appointment.id}/edit\`} className="mt-3 flex h-8 …">View appointment</Link>` block with:

```tsx
      <div className="mt-3 space-y-2">
        {attendanceAction ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAttendance(attendanceAction.attended)}
            className="flex h-8 w-full items-center justify-center rounded-(--radius-card) border border-border/75 bg-white text-sm font-semibold text-foreground transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] disabled:opacity-60"
          >
            {attendanceAction.label}
          </button>
        ) : null}
        {attendanceError ? (
          <p role="alert" className="text-xs text-destructive">
            {attendanceError}
          </p>
        ) : null}
        <Link
          href={`/calendar/${appointment.id}/edit`}
          className="flex h-8 items-center justify-center rounded-(--radius-card) border border-border/75 bg-white text-sm font-semibold text-foreground transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]"
        >
          View appointment
        </Link>
      </div>
```

In `CalendarWorkspace`, destructure `canRecordNoShows` in the parameters, and after `openQuickView` (line 591–594) add:

```tsx
  // Only Pro, only a visit whose day has come, never a cancelled one. `today` is
  // the clinic-zone date, so this compares like with like; a visit later today
  // that hasn't started is refused by the server with a plain message.
  function attendanceActionFor(appointment: CalendarAppointment): AttendanceAction | null {
    if (!canRecordNoShows || appointment.status === "cancelled" || appointment.date > today) {
      return null;
    }

    return appointment.status === "no-show"
      ? { attended: true, label: "Mark as attended" }
      : { attended: false, label: "Mark as no-show" };
  }

  async function recordAttendance(appointment: CalendarAppointment, attended: boolean) {
    const result = await recordAppointmentAttendanceAction(appointment.id, attended);
    const status = result.status;

    if (!result.ok || !status) {
      return result.error ?? "We couldn't update this appointment.";
    }

    setAppointments((current) =>
      current.map((item) => (item.id === appointment.id ? { ...item, status } : item))
    );
    setQuickView(null);

    return null;
  }
```

and update the render at the bottom (lines 892–898) to:

```tsx
      {quickView ? (
        <AppointmentQuickView
          appointment={quickView.appointment}
          anchorRect={quickView.rect}
          onClose={() => setQuickView(null)}
          attendanceAction={attendanceActionFor(quickView.appointment)}
          onRecordAttendance={(attended) => recordAttendance(quickView.appointment, attended)}
        />
      ) : null}
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (State is only set inside the async handlers and event handlers, so `react-hooks/set-state-in-effect` is not triggered.)

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: mark a visit as no-show from the calendar quick view and the edit form" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Copy, docs, full gates, browser QA, and the PR

**Files:**
- Modify: `src/lib/public-plans.ts` (Pro features, lines 45–52)
- Modify: `AGENTS.md`, `PROJECT_STATUS.md`

- [ ] **Step 1: Plan copy — only now that the feature exists**

In `src/lib/public-plans.ts` add `"No-show tracking and reporting",` to the Pro `features` list directly after `"Staff activity and utilization",`. (`proAddedFeatures` is derived from this list, so the Settings billing card and the Reports lock screen pick it up automatically.)

Run: `npx vitest run` and look for any test asserting the Pro feature list; update its expected list to include the new line (the plan copy is the single source of truth, so a test that pins it should change with it).

- [ ] **Step 2: Docs**

`AGENTS.md`:
- Calendar → Month view bullet: after `a link into the edit page).` append: ` On a Pro workspace the popover also offers **Mark as no-show** (or **Mark as attended** to undo it) for any non-cancelled visit whose day has come; a no-show pill is violet (owner-approved 2026-09-22).`
- Reports → Highlights bullet: after `never leaves visible blank space below a short list.` append: ` A **No-show rate** tile joins when a no-show has been recorded (ahead of Follow-up coverage); the five-tile cap still holds, so Active clients is the one dropped when six would show.`
- Plans/Feature-gating section: add a bullet `- No-show tracking (recording a no-show, the no-show rate in Reports) is Pro. Basic workspaces keep the four existing statuses.`

`PROJECT_STATUS.md`: add a bullet under the latest completed work: `No-show status (Pro): NO_SHOW appointment status, "Mark as no-show/attended" in the calendar quick view, No-show rate in Reports; PR 1 of the no-show/workflow series (spec + plans in docs/superpowers).`

- [ ] **Step 3: Full gates**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all green; the reports characterization snapshot unchanged (`git status` must not show `src/lib/__snapshots__/reports.test.ts.snap` as modified in content — a line-ending-only entry from Windows is noise, not a change).

- [ ] **Step 4: Browser QA (needs Task 0's go-ahead applied first)**

Start `vela-dev` with `preview_start` and, on the Pro test clinic, check each of these and note the result:
1. Calendar → a past completed appointment → quick view shows **Mark as no-show**; click it → the pill turns violet with "No-show"; the popover closes.
2. Same appointment → quick view shows **Mark as attended**; click → back to green Completed.
3. A cancelled appointment and a future-dated one show **no** attendance button.
4. Edit page of a past appointment → Status dropdown lists **No-show**; saving it works and the calendar shows violet.
5. Reports (period containing the no-show): Highlights shows **No-show rate**, the status donut has a violet **No-show** slice, Completion rate dropped versus before.
6. Dashboard: the Visits chart total for that day dropped by one; Completion rate KPI updated.
7. That client's profile: the appointment badge reads **no-show** (not `no_show`); their Last visit moved back if that was their latest visit.
8. `read_console_messages` shows no errors.
Undo every test change (Mark as attended) so the demo clinic's data is left as found.

- [ ] **Step 5: Push, PR, review**

```bash
git push -u origin feat/no-show-status
gh pr create --base main --title "No-show status: record, report, and count no-shows correctly" --body-file <body>
```

The design spec (`docs/superpowers/specs/2026-09-22-no-show-and-workflows-design.md`) and this plan are still uncommitted in the worktree — with the owner's OK, include both in this PR (`git add docs/superpowers`) so the reasoning travels with the code. The PR body lists: what changed (the six tasks in one line each), the **three deviations from the spec**, the deploy-order note (SQL first), and what was checked. Then `@coderabbitai full review` once the automatic run ends; fix every real finding (fix the class, not the line), reply on each thread, and re-request a full review after each push until it comes back clean. **Do not merge without the owner's explicit go-ahead.**

---

## Self-Review

**Spec coverage (component 1 — No-show status):**
- New `NO_SHOW` status, Pro-only setting → Tasks 1, 4, 5. ✔
- End-of-day recording path → replaced by the quick-view button (deviation 1, explained: the sweep auto-completes visits). ✔ (flagged)
- Reports no-show rate + donut slice → Task 3. ✔
- Client profile `noShows: 0` placeholder made real → Task 2 Step 5. ✔
- Downgrade edge case (existing no-show readable/editable on Basic) → Task 4 Step 6 + test; form keeps the option listed → Task 5 Step 1. ✔
- Plan gating enforced server-side, not only in the UI → Task 4 (save + action) with tests. ✔
- Pricing copy only after the feature exists → Task 6 Step 1. ✔
- Everything that already switches on status made safe (calendar, dashboard, mobile, staff, clients, reminders, reports, badges) → Tasks 1–3, with `tsc` as the exhaustiveness net. ✔
- Risk score, Follow-ups list, confirm-by-reply, waiting list, drafted-message workflows → PRs 2–5, planned separately. (Out of this plan by design.)

**Placeholder scan:** no TBD/TODO; every code step shows the code; the only steps without unit tests (raw-SQL predicate, Prisma `where` edits, UI components) say so and name the QA check that covers them.

**Type consistency:** `toCalendarStatus`/`toCalendarTone` (exported in Task 1, used in Task 1 Step 6); `recordAppointmentAttendanceCore` signature (Task 4 Step 3) matches its use in the action (Step 6) and the mock (`mocks.recordAttendance`, Step 4); `RecordAttendanceResult.status` is a `CalendarAppointmentStatus`, consumed as `result.status` in Task 5; `canRecordNoShows` is `boolean` on `CalendarWorkspace` and optional `boolean` on the form; `appointmentStatusKey` (Task 1) is the only place `NO_SHOW` becomes `"no-show"` for display in the client/staff surfaces.
