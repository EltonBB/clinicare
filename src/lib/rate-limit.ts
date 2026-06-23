import { Ratelimit } from "@upstash/ratelimit";

import { getRedis } from "@/lib/redis";

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

function getRedisLimiter(rule: RateLimitRule): Ratelimit | null {
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  const cacheKey = `${rule.limit}:${rule.windowMs}`;
  let limiter = limiterCache.get(cacheKey);

  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      // Sliding window avoids the boundary burst a fixed window allows.
      limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowMs} ms`),
      prefix: "vela:rl",
      // Skip the extra analytics writes — we only need enforcement.
      analytics: false,
    });
    limiterCache.set(cacheKey, limiter);
  }

  return limiter;
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
    }
  }

  return checkRateLimitInMemory(key, rule);
}

/** Best-effort client IP from proxy headers (Vercel sets `x-forwarded-for`). */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return headers.get("x-real-ip")?.trim() || "unknown";
}
