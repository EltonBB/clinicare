import { getRedis } from "@/lib/redis";

/**
 * Provider-agnostic cache seam (cache-aside).
 *
 * Redis-backed when configured; otherwise a small per-instance in-memory TTL map
 * so dev / test / unconfigured deploys still work. A cache fault NEVER throws —
 * it falls through to the producer, because the cache is an optimization, never
 * a hard dependency.
 *
 * HIPAA — NON-PHI ONLY: never cache patient-identifying data here (names,
 * phones, conversations, clinical detail). Caching PHI means storing it in a
 * third-party store, which requires an Upstash BAA + the controls in
 * plans/REDIS.md. Cache only non-patient values (public/marketing data, billing
 * plan state, anonymized aggregates, computed counts).
 */
const NAMESPACE = "vela:cache:";

// Bound the fallback map so an unconfigured/dev instance can't grow it without
// limit (matches the rate limiter's MAX_TRACKED_KEYS). Only relevant when Redis
// is absent — in prod the Redis path is used and this map stays empty.
const MAX_MEMORY_ENTRIES = 10_000;

type MemoryEntry = { value: unknown; expiresAt: number };

declare global {
  // One map across hot reloads / serverless instance reuse.
  var velaMemoryCache: Map<string, MemoryEntry> | undefined;
}

const memory = global.velaMemoryCache ?? new Map<string, MemoryEntry>();
if (!global.velaMemoryCache) {
  global.velaMemoryCache = memory;
}

function memoryGet<T>(key: string): T | null {
  const hit = memory.get(key);
  if (!hit) {
    return null;
  }
  if (Date.now() >= hit.expiresAt) {
    memory.delete(key);
    return null;
  }
  return hit.value as T;
}

function memorySet(key: string, value: unknown, ttlSeconds: number) {
  // When full and adding a NEW key, sweep expired entries first, then FIFO-drop
  // the oldest if still at the cap (Map preserves insertion order).
  if (memory.size >= MAX_MEMORY_ENTRIES && !memory.has(key)) {
    const now = Date.now();
    for (const [existingKey, entry] of memory) {
      if (now >= entry.expiresAt) {
        memory.delete(existingKey);
      }
    }
    if (memory.size >= MAX_MEMORY_ENTRIES) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) {
        memory.delete(oldest);
      }
    }
  }

  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/**
 * Return the cached value for `key`, or run `producer`, cache its result for
 * `ttlSeconds`, and return it. `key` should namespace the data, e.g.
 * `plans:public` or `staff-count:<businessId>`.
 */
export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>
): Promise<T> {
  const namespaced = NAMESPACE + key;
  const redis = getRedis();

  if (redis) {
    try {
      const cached = await redis.get<T>(namespaced);
      if (cached !== null && cached !== undefined) {
        return cached;
      }
    } catch {
      // Cache read fault — fall through to the producer.
    }
  } else {
    const cached = memoryGet<T>(namespaced);
    if (cached !== null) {
      return cached;
    }
  }

  const fresh = await producer();

  if (redis) {
    try {
      await redis.set(namespaced, fresh, { ex: ttlSeconds });
    } catch {
      // Cache write fault — the value is still returned to the caller.
    }
  } else {
    memorySet(namespaced, fresh, ttlSeconds);
  }

  return fresh;
}

/** Invalidate a single cache key (call after a mutation changes the source). */
export async function invalidateCache(key: string): Promise<void> {
  const namespaced = NAMESPACE + key;
  const redis = getRedis();

  if (redis) {
    try {
      await redis.del(namespaced);
    } catch {
      // Best-effort; a stale entry expires on its own TTL.
    }
    return;
  }

  memory.delete(namespaced);
}
