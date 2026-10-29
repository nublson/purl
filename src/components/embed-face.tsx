"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useLiveCards } from "@/hooks/use-live-cards";
import { useIsSelectionActive } from "@/lib/link-selection";
import { useIsMediaOpen } from "@/lib/media-viewer";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { EmbedFrame, useEmbedLoadTimeout } from "./embed-frame";
import { MediaAnchor } from "./media-face-anchor";
import { LinkPreviewThumbnail } from "./link-preview-thumbnail";
import { Typography } from "./typography";

const COARSE_QUERY = "(pointer: coarse)";

function subscribeCoarse(onChange: () => void) {
  const query = window.matchMedia(COARSE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * A touch screen (true until hydration, so the server never draws a
 * frame). The `pointer-coarse:` variant draws what touch shows on first
 * paint; this keeps the frame from mounting there at all.
 */
function useIsCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE_QUERY).matches,
    () => true,
  );
}

/**
 * The card's opener over a live square must sit above it: Chromium sends the
 * wheel to the topmost frame, even an inert one, so the grid only scrolls
 * if the opener is on top. Both cards add this to their opener for this face.
 */
export const EMBED_OPENER_CLASS = "z-[1]";

/** The small chips in the square's corners ("Couldn't load", "Live"). */
const CHIP =
  "pointer-events-none absolute rounded-[3px] bg-background/85 px-1.5 py-0.5 leading-4 font-medium text-foreground shadow-sm backdrop-blur-sm";

/** One of the square's chips: a short label on the page's surface. */
function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <Typography component="span" size="mini" className={cn(CHIP, className)}>
      {children}
    </Typography>
  );
}

/**
 * A live pearl's face in the grid: a square showing the page itself. The
 * preview (the page's thumbnail, else its favicon or the globe) is drawn
 * first; the sandboxed frame (`EmbedFrame`) mounts over it while the card
 * holds one of the page's live slots (`useLiveCards`, shared with playing
 * videos) and fades in once it loads. One that hasn't loaded after
 * `embedLoadTimeoutMs()` is removed: the preview stays, with "Couldn't
 * load", and the card still opens the viewer.
 *
 * The page is a picture here: the frame is inert and takes no pointer, so
 * the wheel scrolls the grid and a click anywhere on the card reaches its
 * opener, which opens the media viewer, where the page is live to use.
 * Touch screens get no frame: the preview at a page card's 16:10 and a
 * "Live" pill. The landing demo draws the preview only.
 */
export function EmbedFace({
  link,
  anchored = false,
  eager = false,
}: {
  link: Link;
  /** The media viewer opens from this face: its box is the morph's anchor. */
  anchored?: boolean;
  eager?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const demo = useIsDemo();
  const coarse = useIsCoarsePointer();
  const selecting = useIsSelectionActive() && !demo;
  const inViewer = useIsMediaOpen(link.id);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // No frame while the pearl is open in the viewer: the viewer frames its
  // own copy (two would both run, a video's sound included); the anchor
  // shows the preview through the morph back.
  const live = useLiveCards(boxRef, !coarse && !demo && !failed && !inViewer);
  const framed = live && !failed;
  if (!framed && loaded) setLoaded(false);

  // Not loaded in time: drop the frame, keep the preview.
  useEmbedLoadTimeout(framed && !loaded, () => setFailed(true));

  const thumbnailSrc = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;

  const face = (
    <div
      ref={boxRef}
      data-face="embed"
      // Square for the live page; on touch screens (no frame) the preview
      // image keeps a page card's 16:10, uncropped like every page card.
      className="relative aspect-square w-full overflow-hidden bg-muted pointer-coarse:aspect-[16/10]"
    >
      <span data-embed-preview className="absolute inset-0">
        <LinkPreviewThumbnail
          link={link}
          thumbnailSrc={thumbnailSrc}
          eagerThumbnail={eager}
          // The square is its box: no ratio or corners of its own.
          className="absolute inset-0 aspect-auto h-full rounded-none [&_img]:outline-0"
        />
      </span>
      {framed ? (
        <EmbedFrame
          link={link}
          data-state={loaded ? "loaded" : "loading"}
          // A picture of the page: out of the Tab order and the pointer's
          // reach (the card's opener takes the click); it still loads and
          // paints.
          inert
          onLoad={() => setLoaded(true)}
          className={cn(
            "absolute inset-0 size-full border-0 bg-background motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out-strong",
            "pointer-events-none",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
      {failed ? <Chip className="bottom-2 left-2">Couldn&apos;t load</Chip> : null}
      {demo ? null : (
        <Chip className={cn("top-2 left-2 pointer-fine:hidden", selecting && "opacity-0")}>
          Live
        </Chip>
      )}
    </div>
  );

  return anchored ? (
    <MediaAnchor link={link} topOnly>
      {face}
    </MediaAnchor>
  ) : (
    face
  );
}
