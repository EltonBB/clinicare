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
      : process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !==
        "false";

  return {
    rejectUnauthorized,
    ...(ca ? { ca } : {}),
  };
}

const connectionString = normalizeConnectionString(getDatabaseUrl());

const pool =
  global.prismaPool ??
  new Pool({
    connectionString,
    max: 1,
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
