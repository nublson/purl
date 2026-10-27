"use client";

import { useMediaViewer } from "@/lib/media-viewer";
import { useMediaViewerUrl } from "@/lib/media-viewer-url-hook";
import dynamic from "next/dynamic";

// Cambio brings Base UI's dialog and Motion's full `motion` components:
// a chunk of its own, loaded once the page has a media pearl.
const MediaViewer = dynamic(
  () => import("./media-viewer").then((mod) => mod.MediaViewer),
  { ssr: false },
);

/**
 * The page's media viewer: binds it to `?pearl=` and mounts the dialog once
 * any image, video or audio pearl is registered (mount once per page).
 */
export function MediaViewerLazy() {
  useMediaViewerUrl();
  const { count } = useMediaViewer();
  return count > 0 ? <MediaViewer /> : null;
}
