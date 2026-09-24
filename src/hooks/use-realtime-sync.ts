"use client";

import { useLinksSyncActions } from "@/hooks/use-links-sync";
import { LINKS_CLIENT_ORIGIN } from "@/lib/links-origin";
import { LINKS_CHANGED_EVENT } from "@/lib/realtime-constants";
import { useEffect } from "react";

/**
 * Subscribes to Supabase Realtime for the current user's link list and calls
 * `notifyLinksChanged` when another device or tab mutates links. Broadcasts caused by
 * this tab (matching origin) are ignored: the tab already reloaded locally.
 * The Realtime client is imported after mount so it stays off the critical path.
 */
export function useRealtimeSync(userId: string | null) {
  const { notifyLinksChanged } = useLinksSyncActions();

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import("@/lib/supabase-client").then(({ getBrowserRealtime }) => {
      if (cancelled) return;
      const realtime = getBrowserRealtime();
      if (!realtime) return;

      const channel = realtime
        .channel(`links:${userId}`)
        .on("broadcast", { event: LINKS_CHANGED_EVENT }, (message) => {
          const origin = (message.payload as { origin?: unknown } | undefined)
            ?.origin;
          if (origin === LINKS_CLIENT_ORIGIN) return;
          notifyLinksChanged();
        })
        .subscribe();

      cleanup = () => {
        void realtime.removeChannel(channel);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [userId, notifyLinksChanged]);
}
