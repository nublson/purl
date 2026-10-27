"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mediaViewer } from "@/lib/media-viewer";
import {
  ViewerUrl,
  bindViewerUrl,
  type ViewerUrlBinder,
} from "@/lib/media-viewer-url";

/**
 * Keeps `?pearl=<id>` and the media viewer in step (mount it once, on the
 * pages that show pearls). Uses `history` directly: Next's router sees
 * `pushState`/`replaceState` and keeps `useSearchParams` in sync, while
 * `router.push` would rerender the server tree. The logic is
 * `bindViewerUrl`; this is the React wiring.
 *
 * `pendingId` is the pearl the URL names while the page hasn't registered it
 * yet (so a page can fetch an unknown id); null otherwise. `dismissPending`
 * gives up on it (the fetch failed) and clears the param from the URL.
 */
export function useMediaViewerUrl(): {
  pendingId: string | null;
  dismissPending: () => void;
} {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const binder = useRef<ViewerUrlBinder | null>(null);

  useEffect(() => {
    const viewerUrl = new ViewerUrl(
      {
        pushState: (url) => window.history.pushState(null, "", url),
        replaceState: (url) => window.history.replaceState(null, "", url),
        back: () => window.history.back(),
      },
      () => location.pathname + location.search + location.hash,
    );
    const bound = bindViewerUrl(
      mediaViewer,
      viewerUrl,
      () => location.search,
      setPendingId,
    );
    binder.current = bound;
    const onPopState = () => bound.onPopState();
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      bound.dispose();
      binder.current = null;
    };
  }, []);

  const dismissPending = useCallback(() => binder.current?.dismissPending(), []);
  return { pendingId, dismissPending };
}
