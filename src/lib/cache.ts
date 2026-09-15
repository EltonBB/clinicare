import {
  getRedis,
  noteRedisFailure,
  noteRedisStoreSucceeded,
} from "@/lib/redis";

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
 *
 * TENANT SCOPING — the caller's responsibility: this seam adds only a constant
 * namespace, so any per-tenant value MUST include the businessId in `key`
 * (e.g. `staff-count:${businessId}`). An unscoped key would serve one clinic's
 * cached value to another — a tenant-isolation break. Only genuinely global
 * data (e.g. `plans:public`) may omit a tenant segment.
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
      // Cache read fault — fall through to the producer. Reported so a run of
      // these opens the breaker; otherwise every miss re-pays the timeout AND
      // callers using this as a throttle lock lose their throttle entirely.
      noteRedisFailure();
    }
  } else {
    const cached = memoryGet<T>(namespaced);
    if (cached !== null) {
      return cached;
    }
  }

  const fresh = await producer();

  // Reuses the client resolved above rather than re-asking the seam. Doing so
  // deliberately: this write is how a half-open probe learns whether Redis
  // accepts writes at all. Re-resolving would hand back null the moment the
  // breaker re-armed, the SET would never run, and a Redis that reads fine but
  // rejects writes would look healthy — the breaker would close on the read
  // and reopen only after fresh failures, cycling forever.
  if (redis) {
    try {
      await redis.set(namespaced, fresh, { ex: ttlSeconds });
      // A stored SET is the breaker's recovery signal (see lib/redis.ts).
      noteRedisStoreSucceeded();
    } catch {
      // Cache write fault — the value is still returned to the caller.
      noteRedisFailure();
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
      // Deliberately NOT reported as a store: DEL is not denyoom-flagged, so it
      // keeps succeeding while the store is full and every SET fails.
    } catch {
      // Best-effort; a stale entry expires on its own TTL.
      noteRedisFailure();
    }
    return;
  }

  memory.delete(namespaced);
}

// Version counters live 7 days — they only need to outlive every versioned
// entry's own (much shorter) TTL by a wide margin, so a version number is
// never reused while data cached under it could still be live.
const VERSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function versionCounterKey(key: string): string {
  return `${key}:version`;
}

function versionedDataKey(key: string, version: number): string {
  return `${key}:v${version}`;
}

async function readVersion(key: string): Promise<number | null> {
  const namespaced = NAMESPACE + versionCounterKey(key);
  const redis = getRedis();

  if (redis) {
    try {
      const value = await redis.get<number>(namespaced);
      return value ?? 0;
    } catch {
      noteRedisFailure();
      return null;
    }
  }

  return memoryGet<number>(namespaced) ?? 0;
}

/**
 * Like getCached, but immune to the classic cache-aside invalidation race:
 * a producer() that started before invalidateCacheVersioned() ran and only
 * finishes after it would otherwise repopulate the live key with the stale
 * value it read (invalidateCache's plain DEL does nothing to stop that — the
 * late SET lands right after the DEL and looks like a fresh cache entry).
 *
 * Versioned reads fold a separately-tracked version number into the actual
 * cache key; invalidation bumps that number instead of deleting data, so a
 * producer call that's still in flight when the version moves on ends up
 * writing under the OLD version's key — which nothing reads anymore once the
 * version has advanced, and which simply expires on its own short TTL. Use
 * this (with invalidateCacheVersioned) instead of getCached/invalidateCache
 * whenever a caller needs "invalidate is visible on the very next read," not
 * just "eventually," which plain TTL expiry already gives for free.
 *
 * If the version itself can't be read (a cache fault), this bypasses caching
 * entirely for that call rather than guess — reading under the wrong version
 * number is exactly the inconsistency this function exists to prevent.
 */
export async function getCachedVersioned<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>
): Promise<T> {
  const version = await readVersion(key);
  if (version === null) {
    return producer();
  }
  return getCached(versionedDataKey(key, version), ttlSeconds, producer);
}

/** Invalidate a versioned key (see getCachedVersioned) by advancing its version. */
export async function invalidateCacheVersioned(key: string): Promise<void> {
  const namespaced = NAMESPACE + versionCounterKey(key);
  const redis = getRedis();

  if (redis) {
    try {
      await redis.incr(namespaced);
      await redis.expire(namespaced, VERSION_TTL_SECONDS);
      // INCR is denyoom-flagged like SET, so a completed one is a valid
      // store-succeeded signal for the breaker — same reasoning as SET.
      noteRedisStoreSucceeded();
    } catch {
      noteRedisFailure();
    }
    return;
  }

  const current = memoryGet<number>(namespaced) ?? 0;
  memorySet(namespaced, current + 1, VERSION_TTL_SECONDS);
}
