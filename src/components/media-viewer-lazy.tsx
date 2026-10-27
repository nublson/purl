"use client";

import { useMediaViewer } from "@/lib/media-viewer";
import dynamic from "next/dynamic";
import { useState } from "react";

// Cambio brings Base UI's dialog and Motion's full `motion` components:
// a chunk of its own, loaded once the page has a media pearl.
export const loadMediaViewer = () => import("./media-viewer");
const MediaViewer = dynamic(
  () => loadMediaViewer().then((mod) => mod.MediaViewer),
  { ssr: false },
);

/**
 * The page's media viewer: mounts the dialog once any image, video or audio
 * pearl is registered (mount once per page), and keeps it mounted from then
 * on, so a close that takes the last pearl with it (a live reload removing
 * them, a deep-linked pearl leaving once its close settles) still plays its
 * exit; a closed dialog costs nothing. The page binds `?pearl=` itself
 * (`useMediaViewerUrl`), since it's the one that can resolve a pearl the
 * URL names but its list doesn't have.
 */
export function MediaViewerLazy() {
  const { count } = useMediaViewer();
  const [mounted, setMounted] = useState(false);
  if (count > 0 && !mounted) setMounted(true);
  return mounted ? <MediaViewer /> : null;
}
