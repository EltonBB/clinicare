import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { Pool } from "pg";

// Apply the same grant restriction when first creating the trigger and when
// hardening an already installed database through the standalone SQL file.
const restrictTriggerExecutionSql = readFileSync(
  new URL("./sql/restrict-auth-delete-trigger-execute.sql", import.meta.url),
  "utf8"
);

function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DIRECT_URL or DATABASE_URL for auth delete sync setup.");
}

const databaseUrl = new URL(connectionString);
if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !databaseUrl.hostname) {
  throw new Error("Auth delete sync requires a PostgreSQL URL with an explicit host.");
}

// pg lets connection-string parameters override the explicit Pool options.
// Refuse host/TLS overrides so a loopback URL cannot silently connect to a
// remote server without TLS, and a remote URL cannot disable verification.
for (const parameter of ["host", "ssl", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
  if (databaseUrl.searchParams.has(parameter)) {
    throw new Error(`Unsupported database URL parameter for auth delete sync: ${parameter}`);
  }
}

const databaseHost = databaseUrl.hostname;
const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(databaseHost);
const databaseCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");

// sslmode is commonly present in Supabase URLs, but the Pool options below
// enforce verified TLS regardless of its value.
databaseUrl.searchParams.delete("sslmode");

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  max: 1,
  idleTimeoutMillis: 10_000,
  // This script holds privileged database credentials. Local test databases may
  // be plain TCP on loopback; all remote connections must verify the server.
  ssl: isLoopback
    ? false
    : { rejectUnauthorized: true, ...(databaseCa ? { ca: databaseCa } : {}) },
});

const sql = `
create or replace function public.handle_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public."Business"
  where "ownerId" = old.id::text;

  return old;
end;
$$;

${restrictTriggerExecutionSql}

drop trigger if exists on_auth_user_deleted on auth.users;

create trigger on_auth_user_deleted
after delete on auth.users
for each row
execute function public.handle_auth_user_deleted();

delete from public."Business" b
where not exists (
  select 1
  from auth.users u
  where u.id::text = b."ownerId"
);
`;

const client = await pool.connect();

try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("Supabase auth delete sync is configured.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
