import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://yyrthpiuraydtryanpyw.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  "sb_publishable_Aljks0hM5B7YgKEJjpp86w_bYthsZmW";

export const createClient = () =>
  createBrowserClient(supabaseUrl!, supabaseKey!);
