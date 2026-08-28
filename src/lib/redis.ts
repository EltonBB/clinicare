import { Redis } from "@upstash/redis";

/**
 * Redis provider seam — the ONLY module that constructs the Upstash client.
 * Everything else (cache, rate limiting) depends on `getRedis()`, so running
 * without Redis configured, or swapping the provider later, stays a one-file
 * change. Upstash's REST client is used (HTTP, not TCP) because that's what
 * fits Vercel's serverless model — no connection pool to exhaust.
 *
 * Reads the env vars the Vercel ↔ Upstash Marketplace integration injects
 * (`KV_REST_API_*`), falling back to the Upstash-native names for portability.
 *
 * HIPAA: this client must only ever hold NON-PHI (rate-limit counters, cache of
 * non-patient data, ephemeral tokens). Storing PHI in Redis requires an Upstash
 * BAA + the controls in plans/REDIS.md — do not bypass that.
 */
function readRedisConfig() {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    "";
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    "";

  return { url, token };
}

/**
 * Per-request timeout for a single Redis call. Rate limiting degrades to an
 * in-memory limiter when Redis is unreachable (`lib/rate-limit.ts`), so the
 * fault path must cost milliseconds, not seconds.
 *
 * Note this bounds ONE call: `getCached` makes two (get, then set), so it is
 * the breaker below — not this constant — that bounds an outage's total cost.
 */
export const REDIS_REQUEST_TIMEOUT_MS = 500;

/**
 * Circuit breaker. The timeout above bounds one call; this bounds an outage,
 * which is what actually hurts — Upstash archives idle free-tier databases, so
 * "unreachable for days" is routine here.
 *
 * While open, `getRedis()` returns null and callers take their in-memory path.
 * That matters most in `getCached`, where a *failed* read is indistinguishable
 * from a miss and re-runs the producer every time — turning the workspace sweep
 * throttle off exactly when the database is already struggling.
 *
 * It is driven by FAILURES ONLY. A success is never taken as evidence of
 * health, because it isn't: Redis can be readable while writes fail — the free
 * tier rejects writes once the size cap is hit, and a read-only token behaves
 * the same way — so `getCached`'s GET succeeds immediately before its SET
 * fails. Any design that lets a success reset state gets defeated by that
 * interleaving; recovery is therefore proven by the ABSENCE of failures for a
 * full window, not by anything succeeding.
 *
 * Failures accumulate in a rolling window and age out, so blips spread further
 * apart than the window never trip it.
 *
 * Recovery is half-open: when the cooldown lapses exactly ONE caller is handed
 * the client and the window re-arms immediately, so a burst arriving at that
 * moment keeps using the fallback instead of all paying the timeout. Admission
 * re-arms on a clock rather than waiting for the probe to report, so a caller
 * that takes the client and never reports costs one extra cooldown — it cannot
 * wedge the breaker open.
 */
const BREAKER_THRESHOLD = 3;
const BREAKER_WINDOW_MS = 60_000;
const BREAKER_COOLDOWN_MS = 30_000;

let failuresInWindow = 0;
let windowStartedAt = 0;
let lastFailureAt = 0;
let breakerOpenUntil = 0;
let lastWarnedAt = 0;

// `undefined` = not yet resolved; `null` = resolved but unconfigured.
let client: Redis | null | undefined;

/**
 * Shared Upstash Redis client, or `null` when Redis isn't configured (local dev
 * / test / a deploy without the env vars) or the breaker is open, so callers
 * degrade gracefully instead of throwing.
 */
export function getRedis(): Redis | null {
  if (client === undefined) {
    const { url, token } = readRedisConfig();
    client = url && token ? buildClient(url, token) : null;
  }

  if (client === null) {
    return null;
  }

  if (breakerOpenUntil === 0) {
    return client;
  }

  const now = Date.now();

  // Closed again once a full window has passed with NO new failure. Recovery is
  // the absence of failures, never the presence of a success — a probe's read
  // can succeed while the write that follows it in the same call still fails.
  if (now - lastFailureAt >= BREAKER_WINDOW_MS) {
    breakerOpenUntil = 0;
    failuresInWindow = 0;
    windowStartedAt = 0;
    lastWarnedAt = 0;
    console.warn("[redis] Recovered; resuming shared cache and rate limiting.");
    return client;
  }

  if (now < breakerOpenUntil) {
    return null;
  }

  // Half-open. Re-arming here — a deliberate write from a getter — is what
  // makes this single-flight: the next caller sees an unexpired window and
  // takes the fallback, so only this one probe pays the timeout.
  breakerOpenUntil = now + BREAKER_COOLDOWN_MS;
  return client;
}

/**
 * The Upstash constructor THROWS on a malformed url (`UrlError`), and callers
 * reach `getRedis()` outside their try blocks — so one typo'd env var would
 * take down every authenticated page render, not just caching. A bad config
 * has to degrade like an absent one.
 */
function buildClient(url: string, token: string): Redis | null {
  try {
    return new Redis({
      url,
      token,
      // SDK default is 5 retries with exponential backoff. Measured against an
      // unreachable host that costs 4.31s per call, and the caller falls back
      // to its in-memory path anyway.
      retry: { retries: 1, backoff: () => 50 },
      // MUST stay the function form: the SDK calls it per request, so each call
      // gets a fresh timeout. A static signal is built once and shared by this
      // memoized client forever — healthy Redis included — so it would work for
      // 500ms and then abort every later call for the instance's whole life.
      // `redis.test.ts` pins this.
      signal: () => AbortSignal.timeout(REDIS_REQUEST_TIMEOUT_MS),
    });
  } catch {
    // No cause/url in the log: the url carries the Upstash credentials' host.
    console.error(
      "[redis] Client configuration is invalid; continuing with in-memory " +
        "cache and PER-INSTANCE rate limiting. Check the Redis env vars."
    );
    return null;
  }
}

/**
 * Report a failed Redis call to the breaker.
 *
 * Every caller that catches a Redis fault must call this — an unreported
 * failure leaves the breaker closed and the outage cost unbounded. There is
 * deliberately no success counterpart: see the breaker note above.
 */
export function noteRedisFailure(): void {
  const now = Date.now();
  lastFailureAt = now;

  // Failures age out, so blips spread further apart than the window never
  // accumulate into a trip.
  if (now - windowStartedAt > BREAKER_WINDOW_MS) {
    windowStartedAt = now;
    failuresInWindow = 0;
  }
  failuresInWindow += 1;

  if (failuresInWindow < BREAKER_THRESHOLD) {
    return;
  }

  // A failure while open means the half-open probe failed, so hold the window.
  breakerOpenUntil = now + BREAKER_COOLDOWN_MS;

  // Logged on its own clock, not per failure: a sustained outage should stay
  // visible in the log without one line per request.
  if (lastWarnedAt !== 0 && now - lastWarnedAt < BREAKER_COOLDOWN_MS) {
    return;
  }

  lastWarnedAt = now;
  console.warn(
    `[redis] Unavailable after ${failuresInWindow} failures in ${BREAKER_WINDOW_MS / 1000}s. ` +
      `Falling back to in-memory cache and PER-INSTANCE rate limiting — ` +
      `the shared limit is not enforced meanwhile.`
  );
}

/** Test seam: drop the memoized client and reset the breaker. */
export function resetRedisForTests(): void {
  client = undefined;
  failuresInWindow = 0;
  windowStartedAt = 0;
  lastFailureAt = 0;
  breakerOpenUntil = 0;
  lastWarnedAt = 0;
}
