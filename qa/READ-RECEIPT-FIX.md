# Read-receipt repair

The automatic mobile/admin acknowledgment now sends exact IDs from the fetched conversation snapshot. Messages arriving afterward stay unread, including rows with the same timestamp. An explicit **Mark all read** action retains the former whole-thread behavior and clears older unread history outside the 100-message display cap.

Mobile contract: `POST /api/mobile/v1/threads/:id/read` with `{ "seenMessageIds": ["..."] }` (maximum 100 entries). An empty array is a no-op. No body retains legacy mark-all compatibility. Success is `{ "ok": true, "unreadCount": number }`. Malformed JSON, invalid IDs, excess entries, unknown IDs, or IDs from another thread return 400 before any receipt/counter writes. An unowned thread returns 404. Bodies retain the 32 KiB/10-second bound. An empty transport body differs from whitespace/malformed JSON, which is rejected.

Both audiences share a transaction helper. It verifies every selected ID against the owned thread, locks that thread row before touching receipts, marks only unread inbound messages, recounts those remaining, and updates the counter. Concurrent send transactions increment the same thread row and therefore serialize with receipt updates. Retries and duplicate selections cannot decrement counters twice. Admin inbound includes STAFF and SYSTEM messages, so normal mobile cancellation notices have proper receipts too.

Legacy data caveat: previous admin mark-all cleared its counter but never stamped SYSTEM receipts. Those historical SYSTEM rows may conservatively reappear as unread once when recounted; explicit **Mark all read** stamps/resets them. There is no automatic production data migration, and old receipt history cannot be reconstructed perfectly from the missing timestamps. Legacy older mobile clients still use mark-all until upgraded; deploying only the new frontend against an older backend does not establish the new snapshot contract.

## Files for independent review

- `src/lib/mobile/thread-read.ts`: bounded selection schema, shared serialized transaction, ownership validation and counters.
- `src/lib/mobile/inbox.ts`: mobile ownership gate and receipt result.
- `src/lib/mobile/admin-inbox.ts`: symmetric owned admin acknowledgment.
- `src/lib/mobile/json-body.ts` and its test: optional empty transport body support while malformed bodies remain errors.
- `src/app/api/mobile/v1/threads/[id]/read/route.ts`: bounded parsing, validation and numeric unread response.
- `src/app/(workspace)/staff/actions.ts`: owned admin server-action validation and count propagation.
- `src/components/staff/staff-messages-tab.tsx`: fetched IDs, error handling, explicit mark-all, stale-response protection.
- `src/components/staff/staff-details-page.tsx`: unread badge updates only from confirmed server count.
- `qa/read-receipt-race.test.ts`: former expected-failure case converted to passing strict regressions.
- `qa/mobile-api.integration.test.ts`: real PostgreSQL snapshot/selection/overlap/admin/cancellation coverage.
- `qa/mobile-http-postgres.mjs`: listening production Next receipt/cap/legacy/error cases.

No schema, credential, production TLS, or deployment configuration changes are part of this repair. The accompanying mobile proxy change adds private no-store caching and exposes Retry-After to browser clients. This integration worktree has its own dependencies; other worktrees and their shared dependency junctions are untouched. Gate results are recorded separately for the integrated current-main source.
