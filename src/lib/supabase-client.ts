import { RealtimeClient } from "@supabase/realtime-js";

let browserRealtime: RealtimeClient | null = null;

/**
 * Browser Realtime client (anon key) for broadcast subscriptions only. Uses
 * `@supabase/realtime-js` directly instead of the full `supabase-js` client
 * (auth, PostgREST, storage, functions), which the browser never needs.
 * Mirrors supabase-js's setup: `/realtime/v1` over ws(s), anon key as apikey.
 */
export function getBrowserRealtime(): RealtimeClient | null {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  if (!browserRealtime) {
    const endpoint = new URL("realtime/v1", url.endsWith("/") ? url : `${url}/`);
    endpoint.protocol = endpoint.protocol.replace("http", "ws");
    browserRealtime = new RealtimeClient(endpoint.href, {
      params: { apikey: key },
      accessToken: async () => key,
    });
  }
  return browserRealtime;
}
