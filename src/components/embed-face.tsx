"use client";

import { useIsDemo } from "@/contexts/demo-mode-context";
import { useLiveCards } from "@/hooks/use-live-cards";
import { activeEmbed, useIsActiveEmbed } from "@/lib/active-embed";
import { linkSelection, useIsSelectionActive } from "@/lib/link-selection";
import { useIsMediaOpen } from "@/lib/media-viewer";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { Maximize } from "reicon-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { EmbedFrame, useEmbedLoadTimeout } from "./embed-frame";
import { MediaAnchor } from "./media-face-anchor";
import { MediaOpenButton } from "./media-open-button";
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

/** The small chips in the square's corners ("Couldn't load", "Esc to leave", "Live"). */
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
 * Over the frame, a transparent cover ("Interact with …") keeps the wheel
 * and drags for the grid; a click on it makes the card active (one at a
 * time, `activeEmbed`): the cover goes, the square rings, and the page
 * takes the pointer until Esc, a press outside the card, losing the slot
 * or another card becoming active. While selecting, the cover toggles the
 * card instead and the frame is inert. Touch screens get no frame and no
 * cover: the preview and a "Live" pill; a tap opens the viewer. The landing
 * demo draws the preview only.
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
  const coverRef = useRef<HTMLButtonElement>(null);
  const demo = useIsDemo();
  const coarse = useIsCoarsePointer();
  const selecting = useIsSelectionActive() && !demo;
  const active = useIsActiveEmbed(link.id);
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

  // Leaving: no frame any more (the slot lost), a selection starting, the
  // pearl opening in the media viewer ("Open large": the viewer owns Esc and
  // focus from then on), or the card going away.
  useEffect(() => {
    if (!framed || selecting || inViewer) activeEmbed.clearIf(link.id);
  }, [framed, selecting, inViewer, link.id]);
  useEffect(() => () => activeEmbed.clearIf(link.id), [link.id]);

  // While active: Esc (with focus in Purl: inside the frame it's the page's)
  // and a press outside the card give the pointer back.
  useEffect(() => {
    if (!active) return;
    const box = boxRef.current;
    const card = box?.closest<HTMLElement>('[data-cy="link-card"]') ?? box;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Back on the cover, once it's shown again, but only when focus is
      // still with the card (or nowhere): an Esc elsewhere leaves it be.
      const focused = document.activeElement;
      const refocus =
        !focused ||
        focused === document.body ||
        (card !== null && card !== undefined && card.contains(focused));
      activeEmbed.clearIf(link.id);
      if (refocus) {
        requestAnimationFrame(() => coverRef.current?.focus({ preventScroll: true }));
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (card && event.target instanceof Node && card.contains(event.target)) return;
      activeEmbed.clearIf(link.id);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [active, link.id]);

  const thumbnailSrc = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;

  const face = (
    <div
      ref={boxRef}
      data-face="embed"
      data-active={active || undefined}
      // Focused when it becomes active, so Esc reaches Purl and Tab goes
      // into the page next.
      tabIndex={active ? -1 : undefined}
      className="relative aspect-square w-full overflow-hidden bg-muted outline-none"
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
          // Out of the Tab order (and the pointer's reach) until the card
          // is active; it still loads and paints.
          inert={selecting || !active}
          onLoad={() => setLoaded(true)}
          className={cn(
            "absolute inset-0 size-full border-0 bg-background motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-out-strong",
            loaded ? "opacity-100" : "opacity-0",
            active ? "pointer-events-auto" : "pointer-events-none",
          )}
        />
      ) : null}
      {framed ? (
        // Above the frame and the card's opener; never on touch screens.
        <button
          ref={coverRef}
          type="button"
          aria-label={`Interact with ${link.title}`}
          aria-hidden={selecting || undefined}
          tabIndex={selecting ? -1 : undefined}
          className={cn(
            "pointer-events-auto absolute inset-0 z-[1] cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset pointer-coarse:hidden",
            active && "hidden",
          )}
          onClick={(event) => {
            if (selecting) {
              linkSelection.toggle(link.id, { shiftKey: event.shiftKey });
              return;
            }
            activeEmbed.set(link.id);
            boxRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      {active ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[2] ring-2 ring-ring ring-inset"
            style={{ borderRadius: "inherit" }}
          />
          <Chip className="right-2 bottom-2 z-[2]">Esc to leave</Chip>
        </>
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

/**
 * "Open large": a live card's second way into the media viewer (the card's
 * own opener is under the square's cover), beside its `⋯`.
 */
export function EmbedOpenLarge({
  link,
  className,
}: {
  link: Pick<Link, "id" | "title">;
  className?: string;
}): ReactNode {
  return (
    <MediaOpenButton
      link={link}
      selecting={false}
      preset="smooth"
      aria-label="Open large"
      title="Open large"
      className={cn(
        "flex size-8 cursor-pointer items-center justify-center rounded-md text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring pointer-coarse:hidden",
        className,
      )}
    >
      <Maximize className="size-4" aria-hidden />
    </MediaOpenButton>
  );
}
