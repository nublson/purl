import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client (secret key) for Realtime broadcast from API
 * routes. Names follow Supabase's Vercel integration (`SUPABASE_URL`,
 * `SUPABASE_SECRET_KEY`); the legacy service role key is the fallback.
 */
export function getAdminSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
