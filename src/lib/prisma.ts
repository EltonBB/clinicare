import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { getDatabaseUrl } from "@/lib/env";

declare global {
  // Reuse a single pg pool + Prisma client across hot reloads and serverless reuse.
  // This keeps Supabase session-mode client counts from exploding under polling load.
  var prismaPool: Pool | undefined;
  var prisma: PrismaClient | undefined;
}

function normalizeConnectionString(connectionString: string) {
  const [base, hash = ""] = connectionString.split("#", 2);
  const [path, query = ""] = base.split("?", 2);
  const params = new URLSearchParams(query);

  params.delete("schema");
  params.delete("pgbouncer");
  // `pg` handles SSL settings from the explicit pool config below more reliably
  // than from Supabase's `sslmode=require` query parameter.
  params.delete("sslmode");

  const normalizedQuery = params.toString();
  const rebuilt = normalizedQuery ? `${path}?${normalizedQuery}` : path;

  return hash ? `${rebuilt}#${hash}` : rebuilt;
}

function buildDatabaseSslConfig() {
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  const rejectUnauthorized =
    process.env.NODE_ENV === "production"
      ? true
      : process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() ===
        "true";

  return {
    rejectUnauthorized,
    ...(ca ? { ca } : {}),
  };
}

const connectionString = normalizeConnectionString(getDatabaseUrl());

// Each authenticated page fans out 5–13 queries via Promise.all; with a single
// connection they were forced to run serially — the dominant page-render
// latency. A small pool lets them run concurrently. The default is kept low so
// the per-instance connection count stays well within the Supabase *session*
// pooler's budget under the pilot's traffic. To scale, move the runtime
// DATABASE_URL to the transaction pooler (:6543) and raise DATABASE_POOL_MAX —
// tuning the ceiling then takes a deploy env change, not a code change.
function resolvePoolMax(): number {
  const parsed = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 20) {
    return parsed;
  }
  return 3;
}

const pool =
  global.prismaPool ??
  new Pool({
    connectionString,
    max: resolvePoolMax(),
    idleTimeoutMillis: 10_000,
    ssl: buildDatabaseSslConfig(),
  });

if (!global.prismaPool) {
  global.prismaPool = pool;
}

const adapter = new PrismaPg(pool, {
  disposeExternalPool: true,
});

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

global.prisma = prisma;
