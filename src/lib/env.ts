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
