import "server-only";

import { after } from "next/server";
import { revalidateLandingDemoFor } from "@/lib/demo-revalidation";
import { LINKS_CHANGED_EVENT } from "@/lib/realtime-constants";
import { getAdminSupabase } from "@/lib/supabase-admin";

const BROADCAST_TIMEOUT_MS = 5000;

/**
 * Notifies all subscribed clients for this user that their link list changed,
 * and refreshes the landing page if they're the demo account (every link and
 * folder write calls this). Runs after the response is sent (`after()`), so
 * callers never wait on Realtime. Must be called within a request scope
 * (route handler / server action).
 */
export function broadcastLinksChanged(
  userId: string,
  origin: string | null = null,
): void {
  after(async () => {
    await Promise.all([
      sendLinksChangedBroadcast(userId, origin),
      revalidateLandingDemoFor(userId),
    ]);
  });
}

/**
 * Sends the broadcast over HTTP (`httpSend`), which needs no WebSocket
 * subscribe handshake. `origin` is the tab that made the change (see
 * `LINKS_ORIGIN_HEADER`), echoed so that tab can skip reloading. Never
 * throws; no-ops if Supabase env vars are missing.
 */
export async function sendLinksChangedBroadcast(
  userId: string,
  origin: string | null = null,
): Promise<void> {
  const supabase = getAdminSupabase();
  if (!supabase) return;

  const channel = supabase.channel(`links:${userId}`);
  try {
    await channel.httpSend(
      LINKS_CHANGED_EVENT,
      origin ? { origin } : {},
      { timeout: BROADCAST_TIMEOUT_MS },
    );
  } catch (err) {
    console.error("broadcastLinksChanged: httpSend failed:", err);
  } finally {
    void supabase.removeChannel(channel);
  }
}
