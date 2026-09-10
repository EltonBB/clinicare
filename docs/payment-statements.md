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
