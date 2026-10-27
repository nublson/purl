"use client";

import { useEffect, useState } from "react";
import { mediaViewer } from "@/lib/media-viewer";
import { ViewerUrl, pearlParam } from "@/lib/media-viewer-url";

/**
 * Keeps `?pearl=<id>` and the media viewer in step (mount it once, on the
 * pages that show pearls). Uses `history` directly: Next's router sees
 * `pushState`/`replaceState` and keeps `useSearchParams` in sync, while
 * `router.push` would rerender the server tree.
 *
 * `pendingId` is the pearl the URL names while the page hasn't registered it
 * yet (so a page can fetch an unknown id); null otherwise.
 */
export function useMediaViewerUrl(): { pendingId: string | null } {
  const [requestedId, setRequestedId] = useState<string | null>(null);

  useEffect(() => {
    const viewerUrl = new ViewerUrl(
      {
        pushState: (url) => window.history.pushState(null, "", url),
        replaceState: (url) => window.history.replaceState(null, "", url),
        back: () => window.history.back(),
      },
      () => location.pathname + location.search,
    );
    let previous: string | null = null;
    let requested: string | null = null;

    const request = (id: string | null) => {
      requested = id;
      setRequestedId(id);
      satisfy();
    };

    // Opens the requested pearl as soon as the page has registered it.
    function satisfy() {
      if (requested === null) return;
      const { items, currentId } = mediaViewer.getSnapshot();
      if (currentId !== null) {
        // Something else is showing; a stale request must not reopen later.
        requested = null;
        setRequestedId(null);
        return;
      }
      if (!items.some((item) => item.id === requested)) return;
      const id = requested;
      requested = null;
      setRequestedId(null);
      mediaViewer.open(id);
    }

    const sync = () => {
      const { currentId } = mediaViewer.getSnapshot();
      if (currentId !== previous) {
        if (currentId === null) viewerUrl.close();
        else if (previous === null) viewerUrl.open(currentId);
        else viewerUrl.navigate(currentId);
        previous = currentId;
      }
      satisfy();
    };

    const onPopState = () => {
      viewerUrl.onPopState(location.search);
      // Forward onto a pearl entry reopens it.
      if (mediaViewer.getSnapshot().currentId === null) {
        request(pearlParam(location.search));
      }
    };

    const unsubscribe = mediaViewer.subscribe(sync);
    window.addEventListener("popstate", onPopState);
    request(pearlParam(location.search));
    sync();

    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return { pendingId: requestedId };
}
