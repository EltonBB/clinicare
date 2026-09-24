# Client payment history and statements

The patient file loads 60 ledger entries at a time. Its billed, paid, outstanding,
entry and receipt counts come from the full business/client-scoped history.
Status interpretation is unchanged: paid money uses `Paid`, outstanding money uses
`Unpaid` plus the full amount of `Partially Paid`. Billed includes every ledger
amount, including any historical adjustments. Existing USD formatting is retained;
this change does not convert currencies or correct historical amounts.

Pages use descending `createdAt`, then descending `id`, with explicit keyset bounds.
Equal timestamps do not skip entries, and deleting the cursor row does not break
the next page. This is a live history, not a snapshot held across user requests:
newer entries added elsewhere become visible when the record reloads. A mutation
reload resets the loaded pages; an older in-flight response cannot append to that
new record. Navigating to another client remounts the patient view.

Patient-record reads load the client, relations, and full-history aggregates in
one PostgreSQL Repeatable Read snapshot. The snapshot marker belongs to those
database values; external storage URL signing happens after the transaction.
A save's returned record takes its snapshot after the write commits. The open
screen ignores an older same-patient refresh that arrives late, including after
a successful payment or medical-background save. This ordering assumes reads and
writes use the same PostgreSQL primary; restoration onto an earlier database
generation requires a full page reload. Read-only snapshots do not allocate an
extra transaction ID.
The snapshot uses one connection, so its queries run serially; the read has a
20-second transaction limit and a five-second connection wait. Check patient
record latency under staging load before release, especially for large histories.
If a write commits but the follow-up record read fails, the action reports the
save as complete and asks the user to refresh the page. If a transport error
prevents the client from learning whether a write committed, the screen asks for
a refresh before any intentional retry. The notice remains visible at the current
scroll position, and further patient-file saves are blocked until reload. A
profile save similarly returns its committed patient ID when its follow-up read
fails, so creation cannot be mistaken for a failed write. If post-save inbox
linking fails, the profile form identifies that separate problem and directs an
owner to reopen and save the existing profile to retry linking; reloading alone
does not perform that repair. Payment creation does not yet have an idempotency
key across separate attempts or devices.

`GET /api/clients/[clientId]/payments?format=csv` authenticates the owner and scopes
the client and every payment query to that owner's business. It ignores no records
and accepts no pagination cursor. The fixed attachment name avoids putting patient
information or user-controlled characters in headers. Responses are private and
not cached. Formula prefixes, including those behind whitespace/control characters,
are neutralized before standard CSV quoting.

The CSV is built from one complete SELECT, giving it one database-statement
snapshot. The response is constructed only after all rows are read and encoded;
database errors return a failure instead of a successful partial file. Memory and
response size grow with the client's entire history (rows plus encoded CSV), so an
exceptionally large history can exceed hosting memory/time/response limits. There
is no silent row cap. The browser reports a failed download, with a retry action,
and gives a request up to 60 seconds. A future large-history export service should
produce a complete file before making it downloadable. Exports use the existing
rate limiter (three per user per minute); history reads allow sixty per minute.
