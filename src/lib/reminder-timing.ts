/**
 * Cron timing constants for the reminders job, kept in a prisma-free module
 * (like reminder-fairness.ts / reminder-cursor.ts) so their relationship can
 * be unit-tested directly, against real values — not a hand-copied number in
 * a test mock that can silently drift from reality. Importing reminders.ts
 * pulls in lib/prisma.ts, whose top-level getDatabaseUrl() throws when no
 * .env is present — exactly how CI runs.
 */

/**
 * Wall-clock cap on ONE business's processing. Prisma calls have no abort
 * handle, so a stuck query (a connection-pool wait, a hung transaction)
 * would otherwise block its worker's `await` forever — and since
 * mapWithConcurrency's pool resolves via `Promise.all(workers)`, ONE
 * permanently-stuck worker means the whole call never resolves, so the
 * cursor-persist code after it never runs either: every later run would keep
 * resuming from the SAME stale position, forever re-attempting whatever
 * finished before the hang instead of moving on to the deferred suffix. This
 * bounds that to a single business, at a cost well under the run budget.
 *
 * ~25s (WORKER_SEND_TIMEOUT_MS in the Baileys adapter) doubled for the
 * provider-error breaker's 2-consecutive-failure cap, plus headroom for the
 * database work around each send — and room for one full wait on the
 * clinic's per-minute sending window plus RATE_LIMIT_WAIT_HEADROOM_MS, so a
 * clinic that fills that window in this run still sends past it (Codex #136).
 */
export const PER_BUSINESS_TIMEOUT_MS = 120_000;

/**
 * Room a business keeps after waiting out the clinic's per-minute sending
 * window (Codex #136): the reminder sent after the wait can still take a full
 * worker timeout (~25s) plus the write after it, and has to finish inside
 * PER_BUSINESS_TIMEOUT_MS. A wait that would eat into this is not taken; the
 * rest of that clinic's reminders go on the next run instead.
 */
export const RATE_LIMIT_WAIT_HEADROOM_MS = 30_000;

/**
 * Vercel starts a cron run anywhere inside its scheduled minute, so two
 * five-minute triggers can be as little as 4 min 1 s apart (a :00 run at
 * :00:59, the :05 run at :05:00). A whole invocation must end inside that
 * gap, or the next trigger finds the lock still held and skips, leaving a
 * reminder up to ten minutes late (Codex #165).
 */
export const MIN_TRIGGER_GAP_MS = 241_000;

/** The route's worker-lease check after the job (see the reminders cron route). */
export const WORKER_CHECK_TIMEOUT_MS = 5_000;

/**
 * Hard response deadline for the cron route (the whole reminders job PLUS
 * the stale-entry sweep after it). This is a backstop for the rare case the
 * job's own internal budget check doesn't reach (e.g. one query hanging
 * mid-business); normal runs finish in seconds and never touch it. Sized so
 * that, with the worker-lease check and the Sentry flush (2s, cron-monitor.ts)
 * after it, a worst-case invocation still ends inside MIN_TRIGGER_GAP_MS.
 */
export const HARD_RESPONSE_DEADLINE_MS = 210_000;

/**
 * Reserved for the cursor-persist write itself (a single Redis SET, capped
 * at REDIS_REQUEST_TIMEOUT_MS in lib/redis.ts) plus general scheduling
 * overhead, AFTER the worst-case business described on REMINDER_RUN_BUDGET_MS
 * settles. Generous relative to that write's real cost.
 */
const POST_BUDGET_BUFFER_MS = 15_000;

/**
 * Wall-clock budget for STARTING new businesses. Reminders run every 5
 * minutes, so a business skipped here is retried on the next run — deferred, not
 * dropped. This is a single cheap check between businesses, not a
 * per-operation deadline: at pilot scale the realistic risk is every
 * business hitting the provider-error circuit breaker at once (the WhatsApp
 * worker itself down), which the breaker already bounds to a couple of
 * adapter timeouts per business — this budget is what stops that from
 * compounding across every tenant in one run.
 *
 * DERIVED, not an independent number: a business can be claimed right up to
 * this deadline and then run for the full PER_BUSINESS_TIMEOUT_MS before
 * mapWithConcurrency's `Promise.all(workers)` can settle — and the
 * cursor-persist write sits after that await. If this budget left less than
 * PER_BUSINESS_TIMEOUT_MS of headroom before HARD_RESPONSE_DEADLINE_MS, that
 * worst-case business could still be in flight when the route's own hard
 * deadline gives up on the whole job — the platform's 300s cap would then
 * kill the invocation before the abandoned mapWithConcurrency call ever
 * resolves, so the cursor write never runs. Every later run would restart at
 * the same cursor and could re-hit the same straggler, starving the
 * unattempted suffix — the exact bug the cursor and per-business timeout
 * exist to prevent, reopened one layer down. Subtracting both, with a
 * buffer for the write itself, makes that arithmetically unreachable instead
 * of relying on the three constants being tuned consistently by hand.
 */
export const REMINDER_RUN_BUDGET_MS =
  HARD_RESPONSE_DEADLINE_MS - PER_BUSINESS_TIMEOUT_MS - POST_BUDGET_BUFFER_MS;
