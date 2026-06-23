# 001 — Payment-ledger correctness (Refunded vanishes, Partially Paid overstates)

**Base commit:** `fcd3eb9` · **Category:** correctness / money · **Effort:** M ·
**Risk:** MED · **Depends on:** 005 (characterization tests) strongly recommended
first — this changes numbers clinics see.

## Why this matters

`ClientPayment.status` is a free-text string with these values in use:
`"Paid"`, `"Unpaid"`, `"Partially Paid"`, `"Refunded"` (see the status select in
`src/app/(workspace)/clients/actions.ts` around line 168). Two reducers turn
those rows into the numbers shown on the client record and the dashboard, and
both mishandle two of the four statuses.

### Bug A — `Refunded` falls through every bucket

`src/lib/clients.ts:563-568` (inside `buildClientRecord`'s stats):

```ts
const totalPaidCents = client.payments
  .filter((payment) => payment.status === "Paid")
  .reduce((sum, payment) => sum + payment.amountCents, 0);
const unpaidBalanceCents = client.payments
  .filter((payment) => payment.status === "Unpaid" || payment.status === "Partially Paid")
  .reduce((sum, payment) => sum + payment.amountCents, 0);
```

A `"Refunded"` row is in **neither** bucket — it silently disappears from both
Total paid and Outstanding. Meanwhile the client-detail "Total billed" sums
**all** payments including Refunded (`src/components/clients/client-details-page.tsx`
~line 284, now `formatCurrency(client.payments.reduce(...))`). Net effect: bill a
$100 payment, mark it Refunded → Total billed still $100, Total paid $0,
Outstanding $0. The ledger no longer reconciles and the refund is invisible.

The **same** `Paid` / `Unpaid` / `Partially Paid`-only filter is duplicated in
`src/lib/dashboard.ts` (revenue + outstanding summary, ~lines 285-297), so a
Refunded row also vanishes from dashboard revenue with no offsetting deduction.

### Bug B — `Partially Paid` adds the FULL invoice to outstanding

`src/lib/clients.ts:566-568` and `src/lib/dashboard.ts:~288` both add the entire
`amountCents` of a `"Partially Paid"` row to outstanding. The data model has no
"amount paid so far" field, so a $200 invoice with $120 already paid reports
**$200** outstanding, not $80.

## The decision the executor must surface first (do not guess)

This is partly a **product decision**. Present these two questions to the owner
and get answers before coding:

1. **Refund semantics:** should a `Refunded` payment (a) reduce Total paid
   (ledger-correct: a refund returns money), and/or (b) show as its own
   "Refunded" line? Recommended: subtract refunds from Total paid AND surface a
   separate Refunded total so it's auditable.
2. **Partial payments:** the only correct fix is to represent the paid portion.
   Recommended: add `ClientPayment.amountPaidCents Int @default(0)` and compute
   `outstanding = billed − paid` per row. Confirm before a schema change.

If the owner defers the schema change, the *interim* correct-but-limited fix is:
treat `Partially Paid` as fully unpaid is **wrong** (current behavior); instead,
until `amountPaidCents` exists, do not invent a paid portion — surface that
partial payments need the new field rather than showing a number that's
guaranteed wrong. (i.e. Bug A is fixable now; Bug B needs the field.)

## Steps (assuming the recommended decisions)

1. **Schema:** add `amountPaidCents Int @default(0)` to `model ClientPayment` in
   `prisma/schema.prisma`. Run `npm run db:push` (owner-approved — prod DB).
   Backfill: for existing `"Paid"` rows set `amountPaidCents = amountCents`; for
   `"Partially Paid"` rows leave `0` (operators re-enter the paid portion) — write
   a one-off `scripts/` migration script for the backfill, don't do it by hand.
2. **Centralize the math** in one place so the two reducers can't drift again.
   Add to `src/lib/clients.ts` (or a new `src/lib/payments.ts`):

   ```ts
   export function summarizePayments(payments: Array<Pick<ClientPayment, "status" | "amountCents" | "amountPaidCents">>) {
     let billed = 0, paid = 0, refunded = 0, outstanding = 0;
     for (const p of payments) {
       if (p.status === "Refunded") { refunded += p.amountCents; continue; }
       billed += p.amountCents;
       const partPaid = p.status === "Paid" ? p.amountCents : p.amountPaidCents;
       paid += partPaid;
       outstanding += Math.max(p.amountCents - partPaid, 0);
     }
     return { billed, paid, refunded, outstanding };
   }
   ```

3. Replace the `clients.ts` reducers (563-568) and the `dashboard.ts` revenue/
   outstanding reducers with calls to `summarizePayments`.
4. Move the "Total billed" reduce out of `client-details-page.tsx` into
   `buildClientRecord` (it already builds `paymentStats`) — the component should
   receive `totalBilledDisplay` pre-shaped (AGENTS.md: data shaping lives in
   `lib/`). This also folds into plan 006/ARCH-06.
5. Surface `refunded` where relevant (client Payments tab metrics row).

## Verification

- `npm run typecheck && npm run lint && npm run build` all green.
- New unit tests (plan 005): `summarizePayments` over each status combination —
  $100 Paid → paid 100/outstanding 0; $100 Refunded → refunded 100/paid 0/billed 0;
  $200 Partially Paid w/ amountPaidCents 120 → paid 120/outstanding 80.
- Manual signed-in QA: create payments of each status on a test client, confirm
  the client Payments tab + dashboard Revenue/Outstanding tiles reconcile.

## Out of scope / do not touch

- Don't change the statement CSV format beyond making its totals consistent.
- Don't convert `status` to an enum in this plan (separate cleanup).
