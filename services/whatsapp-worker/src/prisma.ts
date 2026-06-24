import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { config } from "./config";

// Mirrors the app's lib/prisma.ts connection handling so the worker reaches the
// same Supabase Postgres with the same TLS posture. The worker reads/writes only
// its own WhatsAppSession / WhatsAppSessionKey rows (non-PHI link credentials).
//
// Note: this resolves @prisma/client / @prisma/adapter-pg / pg from the repo
// root's node_modules (shared, already generated). For a standalone deploy, the
// worker needs its own `prisma generate` against ../../prisma/schema.prisma.

function normalizeConnectionString(connectionString: string): string {
  const [base, hash = ""] = connectionString.split("#", 2);
  const [path, query = ""] = base.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("schema");
  params.delete("pgbouncer");
  params.delete("sslmode");
  const normalizedQuery = params.toString();
  const rebuilt = normalizedQuery ? `${path}?${normalizedQuery}` : path;
  return hash ? `${rebuilt}#${hash}` : rebuilt;
}

function buildSslConfig() {
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  // With a CA, verify the cert strictly. Without one, still encrypt the
  // connection but skip verification — keeps the deploy a one-liner (just
  // DATABASE_URL) for the non-PHI pilot. Set DATABASE_SSL_CA to enforce
  // verification (recommended once on stable infra / before any PHI).
  if (ca) {
    return { rejectUnauthorized: true, ca };
  }
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: normalizeConnectionString(config.databaseUrl),
  max: 2,
  idleTimeoutMillis: 10_000,
  ssl: buildSslConfig(),
});

const adapter = new PrismaPg(pool, { disposeExternalPool: true });

export const prisma = new PrismaClient({ adapter, log: ["error"] });
