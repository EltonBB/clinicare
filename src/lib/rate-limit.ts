import { Ratelimit } from "@upstash/ratelimit";

import { logger } from "@/lib/logger";
import {
  getRedis,
  noteRedisFailure,
  noteRedisWriteSucceeded,
} from "@/lib/redis";

/**
 * Rate limiter with two backings behind one async API:
 *
 *  - **Redis (Upstash) when configured** → a true *cross-instance* sliding-window
 *    limit. This is the real protection on Vercel, where many short-lived
 *    function instances otherwise each keep their own counters.
 *  - **In-memory fallback otherwise** → a per-instance fixed-window counter, so
 *    dev / test / a deploy without Redis still throttle locally and never break.
 *
 * It never throws (a Redis fault falls back to in-memory) and is safe to call on
 * every request; treat a non-allowed result as "ask the caller to retry
 * shortly", never as a hard dependency. Counters are NON-PHI (keys namespace the
 * action + an IP or user id), so no BAA concern.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

declare global {
  // Reuse one bucket map across hot reloads / serverless reuse.
  var rateLimitBuckets: Map<string, Bucket> | undefined;
}

const MAX_TRACKED_KEYS = 10_000;

const buckets = global.rateLimitBuckets ?? new Map<string, Bucket>();

if (!global.rateLimitBuckets) {
  global.rateLimitBuckets = buckets;
}

export type RateLimitRule = {
  /** Max allowed events within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

// One Ratelimit instance per distinct rule (the limiter config is fixed at
// construction), cached so we don't rebuild it per request.
const limiterCache = new Map<string, Ratelimit>();

// Rules whose limiter could not be built. A construction failure is a fixed
// config error, not a transient one, so it is remembered: retrying per request
// would re-log to Sentry on every call AND burn a half-open breaker probe
// without ever issuing a Redis command.
const limiterBuildFailed = new Set<string>();

function getRedisLimiter(rule: RateLimitRule): Ratelimit | null {
  const cacheKey = `${rule.limit}:${rule.windowMs}`;

  // Checked before `getRedis()` on purpose — see the note above.
  if (limiterBuildFailed.has(cacheKey)) {
    return null;
  }

  // The breaker is consulted on EVERY call, including cache hits below: a
  // cached limiter still issues a real Redis command, so short-circuiting
  // before this would let `checkRateLimit` bypass an open breaker entirely.
  // The breaker is consulted on EVERY call, including cache hits below: a
  // cached limiter still issues a real Redis command, so short-circuiting
  // before this would let `checkRateLimit` bypass an open breaker entirely.
  // `rate-limit.test.ts` pins this.
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  const cached = limiterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Construction is guarded because `checkRateLimit` calls this OUTSIDE its try
  // block: a throw here would propagate into every login, signup and search
  // rather than degrading to the in-memory limiter. Same reason `getRedis()`
  // guards the Upstash constructor.
  try {
    const limiter = new Ratelimit({
      redis,
      // Sliding window avoids the boundary burst a fixed window allows.
      limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowMs} ms`),
      prefix: "vela:rl",
      // Skip the extra analytics writes — we only need enforcement.
      analytics: false,
    });
    limiterCache.set(cacheKey, limiter);
    return limiter;
  } catch (error) {
    limiterBuildFailed.add(cacheKey);
    // Logged once per rule, not once per request.
    logger.error(
      "Rate limiter could not be constructed; falling back to PER-INSTANCE in-memory limiting.",
      error
    );
    return null;
  }
}

/** Drop expired buckets when the map grows large, to bound memory. */
function pruneExpired(now: number) {
  if (buckets.size <= MAX_TRACKED_KEYS) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}

/** Per-instance fixed-window fallback (used when Redis isn't configured). */
function checkRateLimitInMemory(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    pruneExpired(now);
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: Math.max(rule.limit - 1, 0), retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(rule.limit - existing.count, 0),
    retryAfterSeconds: 0,
  };
}

/**
 * Record one event for `key` and report whether it is within `rule`.
 * `key` should namespace the action and the subject, e.g. `login:<ip>`.
 * Uses Redis for a global limit when configured, otherwise the in-memory
 * fallback. Always resolves — never rejects.
 */
export async function checkRateLimit(
  key: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const limiter = getRedisLimiter(rule);

  if (limiter) {
    try {
      // `result.pending` (background analytics/multi-region sync) is intentionally
      // not awaited: these routes run on the Node serverless runtime, which keeps
      // the function alive until the response flushes. If any route ever moves to
      // the Edge runtime, await it via `context.waitUntil(result.pending)`.
      const result = await limiter.limit(key);
      // `limit` runs an eval that increments the window — a real write, so it
      // is valid evidence that the write path works again.
      noteRedisWriteSucceeded();
      const now = Date.now();

      return {
        allowed: result.success,
        remaining: Math.max(result.remaining, 0),
        retryAfterSeconds: result.success
          ? 0
          : Math.max(1, Math.ceil((result.reset - now) / 1000)),
      };
    } catch {
      // Redis fault — degrade to the in-memory limiter rather than failing open.
      // Reported so the breaker opens and warns: the fallback is PER-INSTANCE,
      // so across N warm instances the effective limit is N x the rule. That
      // must not degrade silently.
      noteRedisFailure();
    }
  }

  return checkRateLimitInMemory(key, rule);
}

/**
 * Best-effort client IP for rate-limit keying.
 *
 * Prefer `x-real-ip`: on Vercel the platform edge overwrites it with the true
 * client IP, so it can't be forged. `x-forwarded-for` is a client-appendable
 * list whose *leftmost* entry an attacker can spoof to rotate their rate-limit
 * key (defeating the per-IP throttle), so it's only a dev/local fallback for when
 * the platform header is absent.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return "unknown";
}
