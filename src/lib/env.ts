import { z } from "zod";

import { logger } from "@/lib/logger";

function readRequiredEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

export function getDatabaseUrl() {
  return readRequiredEnv(["DATABASE_URL"]);
}

export function getSupabaseUrl() {
  return readRequiredEnv(["NEXT_PUBLIC_SUPABASE_URL"]);
}

export function getSupabasePublishableKey() {
  return readRequiredEnv([
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  ]);
}

/**
 * Unlike the accessors above, not required: only the storage-cleanup sweep
 * (a cron path with no user session) needs it, and its absence should degrade
 * that one feature, not fail the whole app's boot. Returns null instead of
 * throwing so callers can decide how to skip.
 */
export function getSupabaseServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

const requiredEnvSchema = z.object({
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .trim()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
});

// Feature-specific vars: their absence degrades a feature but must not stop the
// server from booting. We surface a loud warning instead of failing deep inside
// a request later.
const importantOptionalEnv: Record<string, string> = {
  APP_URL: "auth email links and absolute URLs may be incorrect",
  CRON_SECRET: "scheduled reminder/analytics jobs will reject every request",
  OPENAI_API_KEY: "AI insights fall back to rule-based snapshots",
  BAILEYS_WORKER_URL: "WhatsApp sending and QR pairing are unavailable",
  BAILEYS_BRIDGE_SECRET:
    "WhatsApp worker requests can't be authenticated, so messaging is unavailable",
  SENTRY_DSN: "server-side error monitoring is silently disabled",
  NEXT_PUBLIC_SENTRY_DSN: "client-side error monitoring is silently disabled",
  EXPO_ACCESS_TOKEN:
    "staff push notifications send unauthenticated (fine until Expo enforces enhanced push security on this account)",
  SUPABASE_SERVICE_ROLE_KEY:
    "the storage-cleanup retry sweep can't authenticate to Storage; pending cleanup rows accumulate until it's set",
};

// Rate limiting (login/signup/mobile-redeem throttles, etc. — see lib/rate-limit.ts)
// silently degrades to a per-serverless-instance in-memory counter without these,
// which is close to no protection at all under Vercel's multi-instance model.
// Warned separately (not folded into importantOptionalEnv) because either var
// alone is enough to configure Upstash — only warn when BOTH naming schemes are
// fully absent.
function hasRedisConfig() {
  const url = process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return !!url && !!token;
}

/**
 * Validate server environment once at startup (see instrumentation.ts). Hard
 * vars fail the boot loudly; feature vars only warn. Never log secret values.
 */
export function validateServerEnv() {
  const errors: string[] = [];
  const parsed = requiredEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }

  const hasPublishableKey =
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim();

  if (!hasPublishableKey) {
    errors.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or _DEFAULT_KEY) is required"
    );
  }

  // In production the pg pool forces rejectUnauthorized:true with no fallback
  // CA (lib/prisma.ts) — without DATABASE_SSL_CA every query fails closed with
  // a P1011 TLS error. That's a total outage, not a degraded feature, so this
  // fails the boot loudly instead of letting every request discover it later.
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_SSL_CA?.trim()) {
    errors.push(
      "DATABASE_SSL_CA is required in production — without it every database query fails (P1011 self-signed cert error)"
    );
  }

  if (errors.length > 0) {
    throw new Error(`Invalid server environment:\n - ${errors.join("\n - ")}`);
  }

  for (const [name, impact] of Object.entries(importantOptionalEnv)) {
    if (!process.env[name]?.trim()) {
      logger.warn(`Environment variable ${name} is not set — ${impact}.`);
    }
  }

  if (process.env.NODE_ENV === "production" && !hasRedisConfig()) {
    logger.warn(
      "Upstash Redis is not configured (KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN) — " +
        "rate limiting (login, signup, mobile code redemption, search) falls back to per-instance " +
        "in-memory counters, which is close to no protection at all across Vercel's multiple " +
        "serverless instances."
    );
  }

  // Connection-pooling guard (warn only). On serverless each function instance
  // opens its own connection; the Supabase transaction pooler (port 6543)
  // multiplexes these safely. A direct (db.<ref>.supabase.co) or session-mode
  // (:5432) runtime URL can exhaust Postgres connections under concurrency.
  if (process.env.NODE_ENV === "production") {
    try {
      const dbUrl = new URL(process.env.DATABASE_URL ?? "");
      const isDirectHost = /(^|\.)db\.[^.]+\.supabase\.co$/i.test(dbUrl.hostname);

      if (isDirectHost || dbUrl.port === "5432") {
        logger.warn(
          "DATABASE_URL does not look like the Supabase transaction pooler (port 6543). " +
            "Under serverless concurrency this can exhaust database connections — point the " +
            "runtime URL at the transaction pooler and keep the direct/session URL in DIRECT_URL."
        );
      }
    } catch {
      // A malformed URL is already reported by the required-env check above.
    }
  }
}
