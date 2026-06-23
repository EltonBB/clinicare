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

// `undefined` = not yet resolved; `null` = resolved but unconfigured.
let client: Redis | null | undefined;

/**
 * Shared Upstash Redis client, or `null` when Redis isn't configured (local dev
 * / test / a deploy without the env vars) so callers degrade gracefully instead
 * of throwing.
 */
export function getRedis(): Redis | null {
  if (client !== undefined) {
    return client;
  }

  const { url, token } = readRedisConfig();
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}
