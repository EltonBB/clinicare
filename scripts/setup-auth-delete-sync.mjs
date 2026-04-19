import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { Pool } from "pg";

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

function normalizeConnectionString(value) {
  const [base, hash = ""] = value.split("#", 2);
  const [path, query = ""] = base.split("?", 2);
  const params = new URLSearchParams(query);

  params.delete("sslmode");

  const normalizedQuery = params.toString();
  const rebuilt = normalizedQuery ? `${path}?${normalizedQuery}` : path;

  return hash ? `${rebuilt}#${hash}` : rebuilt;
}

const pool = new Pool({
  connectionString: normalizeConnectionString(connectionString),
  max: 1,
  idleTimeoutMillis: 10_000,
  ssl: {
    rejectUnauthorized: false,
  },
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
