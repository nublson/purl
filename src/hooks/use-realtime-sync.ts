"use client";

import { useSession } from "@/lib/auth-client";
import { LINKS_CHANGED_EVENT } from "@/lib/realtime-constants";
import { getBrowserSupabase } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Subscribes to Supabase Realtime for the current user's link list.
 * Triggers a soft navigation refresh when another device (or tab) mutates links.
 */
export function useRealtimeSync(
  startTransition: (callback: () => void) => void,
) {
  const { data: session } = useSession();
  const router = useRouter();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;

    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channelName = `links:${userId}`;
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: LINKS_CHANGED_EVENT }, () => {
        startTransition(() => {
          router.refresh();
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, router, startTransition]);
}
