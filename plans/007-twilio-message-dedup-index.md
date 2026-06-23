# 007 — Twilio inbound message dedup (unique index on providerMessageSid)

**Base commit:** `fcd3eb9` · **Category:** correctness · **Effort:** S (code) +
careful data migration · **Risk:** MED (prod-data migration) · **Depends on:** nothing.

## Why this matters

Twilio retries any webhook it doesn't get a prompt 2xx for, so a slow/cold
invocation can redeliver the same inbound message. `src/app/api/webhooks/twilio/
whatsapp/route.ts:286-299` guards against this with a **non-unique** `findFirst`
"already processed?" check on `providerMessageSid`:

```ts
if (messageSid) {
  const alreadyProcessed = await prisma.message.findFirst({
    where: { providerMessageSid: messageSid }, select: { id: true },
  });
  if (alreadyProcessed) return xmlResponse();
}
// ... later, inside a $transaction, tx.message.create({ ... providerMessageSid })
```

The code comment itself notes "A unique index on `Message.providerMessageSid` is
the hard backstop once applied" — but it is **not applied**. Two concurrent
deliveries of the same retried webhook can both pass the `findFirst` before either
inserts → duplicate `Message` **and** double `unreadCount` increment (the very
thing the guard exists to prevent).

## The fix

1. **Migration first (the careful part).** Before adding a unique index, dedup any
   existing rows that share a non-null `providerMessageSid` — a `CREATE UNIQUE
   INDEX` fails if duplicates already exist. Write a `scripts/` one-off that finds
   `(providerMessageSid)` collisions (where not null) and removes/merges the
   extras (keep the earliest, fix any `unreadCount` drift). Run it against prod
   (owner-approved) and confirm zero collisions remain.
2. **Schema:** add a **partial unique** index on `Message.providerMessageSid`
   where not null. Prisma expresses this with `@@unique([providerMessageSid])`
   only if nulls are acceptable as distinct — Postgres treats multiple NULLs as
   distinct, so `@@unique([providerMessageSid])` is safe (rows without a SID don't
   collide). Add it to `model Message`, then `npm run db:push` (owner-approved).
3. **Code:** wrap the `tx.message.create` in a `P2002` catch inside the webhook
   transaction — on unique violation, treat as already-processed and ack
   (`return xmlResponse()`), rolling back the unread increment. This makes the
   dedup enforced by the DB rather than the racy `findFirst` (which can stay as a
   cheap fast-path).
4. The delivery-status `updateMany` (route.ts:262-272) can stay global — Twilio
   SIDs are globally unique and `businessId` isn't resolved on that early-return
   branch.

## Verification

- Migration script run output shows zero remaining `providerMessageSid`
  collisions before the index is created.
- `npm run typecheck && npm run lint && npm run build` green; `npx prisma validate`
  passes.
- Reasoning/PR note: two concurrent identical webhooks → exactly one Message row,
  one unread increment.

## Out of scope

- Don't add tenant scoping to the status `updateMany` (not derivable there, not
  needed given global SID uniqueness).
- Don't change inbound conversation/threading logic.
