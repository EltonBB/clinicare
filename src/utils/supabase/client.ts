import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim();

if (!supabaseUrl) {
  throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error(
    "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"
  );
}

export const createClient = () =>
  createBrowserClient(supabaseUrl, supabaseKey);
