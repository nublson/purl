import "server-only";

import { LINKS_CHANGED_EVENT } from "@/lib/realtime-constants";
import { getAdminSupabase } from "@/lib/supabase-admin";

const BROADCAST_TIMEOUT_MS = 5000;

/**
 * Notifies all subscribed clients for this user that their link list changed.
 * No-ops if Supabase env vars are missing.
 */
export function broadcastLinksChanged(userId: string): Promise<void> {
  const supabase = getAdminSupabase();
  if (!supabase) return Promise.resolve();

  const channelName = `links:${userId}`;
  const channel = supabase.channel(channelName);

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      void supabase.removeChannel(channel);
      resolve();
    };

    const timer = setTimeout(done, BROADCAST_TIMEOUT_MS);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel
          .send({
            type: "broadcast",
            event: LINKS_CHANGED_EVENT,
            payload: {},
          })
          .finally(() => {
            clearTimeout(timer);
            done();
          });
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        clearTimeout(timer);
        done();
      }
    });
  });
}
