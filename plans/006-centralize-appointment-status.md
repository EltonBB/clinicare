# 006 — Centralize appointment-status logic

**Base commit:** `fcd3eb9` · **Category:** tech-debt / correctness · **Effort:** M ·
**Risk:** MED · **Depends on:** 005 (the counts must not change — snapshot them first).

## Why this matters

`AppointmentStatus` is the core domain enum, and its semantics are re-implemented
independently across at least five files — with at least one real **drift**:

- **Status → label:** `reports.ts` `statusLabel` (~441); inline ternaries in
  `calendar.ts` `toCalendarStatus` (~82); `dashboard.ts` `toConfirmedStatus` —
  which folds `PENDING` → `confirmed`, **unlike** `calendar.ts` which keeps
  `pending` distinct. That is an actual behavioral inconsistency, not just dup.
- **Status → tone:** `calendar.ts` `toCalendarTone` (~98).
- **"Finalized" = `COMPLETED || CANCELLED`:** hand-rolled in `reports.ts` (~655),
  `dashboard.ts` (~366), `staff.ts` (~251) — three copies of one rule.
- **"Completed" filters:** `clients.ts` (~554), `dashboard.ts` (~362),
  `reports.ts` (~658), `staff.ts` (~258, ~298, ~305).
- `src/lib/appointments.ts` exists but holds only `completePastConfirmedAppointments`
  — the natural home for these predicates is sitting empty.

Change "what counts as finalized/completed" today and you must find and edit 3+
scattered predicates in lockstep — the exact maintenance trap that produced the
PENDING drift.

## The fix

1. Add to `src/lib/appointments.ts` the shared predicates + maps:
   `isFinalized(status)`, `isCompleted(status)`, `isCancelled(status)`,
   `isBooked(status)` (upcoming-counting), `statusLabel(status)`,
   `statusTone(status)`. Single source of truth.
2. Replace the scattered call sites in `calendar.ts`, `dashboard.ts`, `reports.ts`,
   `staff.ts`, `clients.ts` with these helpers.
3. **Resolve the PENDING drift deliberately** — decide once whether dashboard
   should keep folding `PENDING → confirmed` or show it distinct (likely distinct,
   to match calendar/clients), and apply that decision through the shared helper.
   Record the decision in the PR description.

## Verification

- `npm run typecheck && npm run lint && npm run build` green.
- **Snapshot the current view-model counts BEFORE refactoring (plan 005)** for
  dashboard, reports, staff, clients on a seeded clinic. After the refactor every
  count must match — except the deliberate PENDING reconciliation, which you call
  out explicitly and re-baseline.
- Signed-in QA on each surface (dashboard tiles, reports donut/completion rate,
  staff completion, client stats) confirming numbers are as intended.

## Out of scope

- Don't change the `AppointmentStatus` enum itself.
- Don't merge this with the reports.ts split (ARCH-04) — land status centralization
  first, then split.
