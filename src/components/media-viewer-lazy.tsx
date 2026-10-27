"use client";

import { useMediaViewer } from "@/lib/media-viewer";
import dynamic from "next/dynamic";

// Cambio brings Base UI's dialog and Motion's full `motion` components:
// a chunk of its own, loaded once the page has a media pearl.
const MediaViewer = dynamic(
  () => import("./media-viewer").then((mod) => mod.MediaViewer),
  { ssr: false },
);

/**
 * The page's media viewer: mounts the dialog once any image, video or audio
 * pearl is registered (mount once per page). The page binds `?pearl=` itself
 * (`useMediaViewerUrl`), since it's the one that can resolve a pearl the
 * URL names but its list doesn't have.
 */
export function MediaViewerLazy() {
  const { count } = useMediaViewer();
  return count > 0 ? <MediaViewer /> : null;
}
