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
 * Any success resets the count, so an isolated blip can't trip it. Recovery is
 * half-open: when the cooldown lapses exactly ONE caller is handed the client
 * and the window re-arms immediately, so a burst arriving at that moment keeps
 * using the fallback instead of all paying the timeout and all re-running their
 * producers. Admission re-arms on a clock rather than waiting for the probe to
 * report, so a caller that takes the client and never reports costs one extra
 * cooldown — it cannot wedge the breaker open.
 */
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;

let consecutiveFailures = 0;
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

  if (Date.now() < breakerOpenUntil) {
    return null;
  }

  // Half-open. Re-arming here — a deliberate write from a getter — is what
  // makes this single-flight: the next caller sees an unexpired window and
  // takes the fallback, so only this one probe pays the timeout.
  breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
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
 * Feed the breaker with the outcome of a Redis call.
 *
 * Every caller that catches a Redis fault must report it — an unreported
 * failure leaves the breaker closed and the outage cost unbounded.
 */
export function noteRedisResult(ok: boolean): void {
  if (ok) {
    if (breakerOpenUntil !== 0) {
      console.warn("[redis] Recovered; resuming shared cache and rate limiting.");
    }
    consecutiveFailures = 0;
    breakerOpenUntil = 0;
    lastWarnedAt = 0;
    return;
  }

  consecutiveFailures += 1;

  if (consecutiveFailures < BREAKER_THRESHOLD) {
    return;
  }

  // A failure while open means the half-open probe failed, so hold the window.
  breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;

  // Logged on its own clock, not per failure: a sustained outage should stay
  // visible in the log without one line per request.
  if (lastWarnedAt !== 0 && Date.now() - lastWarnedAt < BREAKER_COOLDOWN_MS) {
    return;
  }

  lastWarnedAt = Date.now();
  console.warn(
    `[redis] Unavailable after ${consecutiveFailures} consecutive failures. ` +
      `Falling back to in-memory cache and PER-INSTANCE rate limiting for ` +
      `${BREAKER_COOLDOWN_MS / 1000}s — the shared limit is not enforced meanwhile.`
  );
}

/** Test seam: drop the memoized client and reset the breaker. */
export function resetRedisForTests(): void {
  client = undefined;
  consecutiveFailures = 0;
  breakerOpenUntil = 0;
  lastWarnedAt = 0;
}
