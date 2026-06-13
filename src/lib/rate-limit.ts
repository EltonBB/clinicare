/**
 * Lightweight, dependency-free rate limiter.
 *
 * This is a per-instance, in-memory fixed-window counter. On serverless (Vercel)
 * each function instance keeps its own counters, so this throttles bursts that
 * land on a single instance and protects dev / single-node deploys completely.
 * It is intentionally a thin seam: for strict cross-instance enforcement at
 * scale, swap the Map for a shared store (Upstash Redis / Vercel KV) inside
 * `checkRateLimit` — the call sites and the return shape stay identical.
 *
 * It never throws and is safe to call on every request; treat a non-allowed
 * result as "ask the caller to retry shortly", never as a hard dependency.
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

/**
 * Record one event for `key` and report whether it is within `rule`.
 * `key` should namespace the action and the subject, e.g. `login:<ip>`.
 */
export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
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
