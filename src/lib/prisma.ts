import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { getDatabaseUrl } from "@/lib/env";

declare global {
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

const connectionString = normalizeConnectionString(getDatabaseUrl());

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

const adapter = new PrismaPg(pool, {
  disposeExternalPool: true,
});

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
