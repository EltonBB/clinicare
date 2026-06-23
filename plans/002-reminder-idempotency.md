# 002 — Reminder idempotency (stop duplicate WhatsApp reminders)

**Base commit:** `fcd3eb9` · **Category:** correctness / PHI-adjacent · **Effort:** M ·
**Risk:** MED · **Depends on:** nothing (code-only — the unique index already exists).

## Why this matters

`src/lib/reminders.ts` sends an appointment reminder, then records that it sent
one. The order is **send → persist**, and the persist is in a transaction that
runs *after* the external send (`src/lib/reminders.ts:188-254`):

```ts
const delivery = await sendTwilioWhatsAppMessage({ to: clientPhone, body });

await prisma.$transaction(async (tx) => {
  // ... upsert conversation, create Message ...
  await tx.appointmentReminder.create({ data: { appointmentId: appointment.id, type: reminderType } });
  // ... update whatsAppConnection ...
});
```

The `AppointmentReminder` row is the dedup record — the next cron run skips an
appointment whose `(appointmentId, type)` reminder already exists. But if the
**transaction throws after the message was already delivered** (DB blip, pool
exhaustion during the cron fan-out), no row is written, so the next run re-selects
the appointment and **re-sends the same reminder to the patient**. The `catch`
counts it as `failed` and moves on, masking that a send already happened.

`AppointmentReminder` already has `@@unique([appointmentId, type])`
(`prisma/schema.prisma:346`) — so we can use it as a claim, no migration needed.

## The fix — claim-before-send, release-on-failure (at-least-once + dedup)

1. **Claim** the reminder by inserting the `AppointmentReminder` row *before*
   sending. The unique constraint makes the claim atomic across concurrent/over-
   lapping cron runs:

   ```ts
   try {
     await prisma.appointmentReminder.create({
       data: { appointmentId: appointment.id, type: reminderType },
     });
   } catch (e) {
     if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
       continue; // already claimed/sent by another run — skip silently
     }
     throw e;
   }
   ```

2. **Send.** Then write the Conversation/Message rows (these are best-effort
   delivery bookkeeping, not the dedup key).

3. **Release on send failure** so a future run can retry:

   ```ts
   try {
     const delivery = await sendTwilioWhatsAppMessage({ to: clientPhone, body });
     await prisma.$transaction(async (tx) => { /* conversation + message + connection */ });
     sent += 1;
   } catch (error) {
     await prisma.appointmentReminder.deleteMany({
       where: { appointmentId: appointment.id, type: reminderType },
     }).catch(() => {}); // release the claim; never let cleanup mask the original error
     failed += 1;
     // existing logging
   }
   ```

This guarantees: at most one in-flight send per `(appointment, type)` (the claim),
and a failed send releases the claim for a later retry. The previous failure mode
(successful send + failed record → duplicate next run) is closed because the claim
is committed *before* the send.

> Keep `Prisma` imported from `@prisma/client` for the `P2002` check (it's already
> imported in `lib/analytics-ai.ts` — follow that pattern).

## Verification

- `npm run typecheck && npm run lint && npm run build` green.
- Reasoning check the four interleavings in a comment/PR description: (a) happy
  path sends once; (b) concurrent runs — second gets P2002, skips; (c) send fails
  → claim released → next run retries once; (d) claim succeeds, process crashes
  before send → claim orphaned → reminder never sent (acceptable: better a missed
  reminder than a duplicate, and a crash mid-send is rare). If (d) is unacceptable,
  add a `sentAt`-null "pending" state and a sweep, but that's a follow-up.
- Manual: run `/api/cron/reminders` against a seeded test clinic twice; confirm
  exactly one reminder per appointment+type.

## Out of scope

- Don't move reminders onto the not-yet-built `sendMessage()` seam here — that's a
  separate roadmap step. This stays inside `lib/reminders.ts` + `lib/whatsapp.ts`.
- Don't add per-provider SID reconciliation (heavier; only if (d) proves real).
