# PostgreSQL integration tests

`npm run test:integration:safety` verifies the connection guard without a database.
`npm run test:integration` needs a dedicated PostgreSQL 17 instance on
`127.0.0.1:55432`, database `vela_integration_test`, user `vela_test` and a password.
Set `VELA_TEST_DATABASE_URL` explicitly to that URL. Other hosts, ports, users,
databases and query parameters are refused; application `.env` URLs are never used.
CI provisions an isolated service with synthetic credentials.

Each run creates a random schema, applies the current Prisma schema, executes
real competing transactions and drops only that generated schema in `finally`.
An interrupted process may leave its generated schema behind inside this disposable
test database. Use a fresh disposable instance if cleanup cannot run.

The suite verifies the existing scheduling lock, actual PostgreSQL lock contention,
overlap rejection, rollback and cancellation/adjacency boundaries. It does not yet
verify appointment revisions or enrollment uniqueness; those tests accompany their
remediation changes. No network provider calls or real clinic data are used.

`prisma db push` does not apply the repository's manual SQL migrations or RLS.
Add explicit migration fixtures before testing manual indexes, grants, RLS or new
rollout/backfill behavior. Passing this suite is not evidence that those migrations
have been applied to production.
