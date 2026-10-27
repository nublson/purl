"use client";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { linkKind } from "@/lib/link-kind";
import { useIsMediaOpen } from "@/lib/media-viewer";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Image as ImageIcon, Video } from "reicon-react";
import { AudioControls } from "./media-card-face";

// What the media viewer (`media-viewer.tsx`) shows of a pearl: an image,
// a video's player or an audio player, sized for the viewer.

/**
 * The viewer's box: 16px from every edge, inside the safe areas (the
 * notch, the home indicator: `--bottom-inset`), 1200px at most.
 */
export const MAX_WIDTH =
  "min(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right), 1200px)";
export const MAX_HEIGHT = "calc(100dvh - 32px - env(safe-area-inset-top) - var(--bottom-inset))";

/** Starts loading a pearl's file (an image's original, a video's poster). */
export function preloadOriginal(link: Link) {
  const kind = linkKind(link);
  const src =
    kind === "image"
      ? safeRemoteImgSrc(link.url)
      : kind === "video" && link.thumbnail
        ? safeRemoteImgSrc(link.thumbnail)
        : null;
  if (!src) return;
  const image = new Image();
  image.decoding = "async";
  image.referrerPolicy = "strict-origin-when-cross-origin";
  image.src = src;
}

export function ViewerMedia({
  link,
  ready,
  roomForArrows,
}: {
  link: Link;
  ready: boolean;
  /** The viewer shows Previous / Next on the media's sides. */
  roomForArrows: boolean;
}) {
  switch (linkKind(link)) {
    case "image":
      return <ViewerImage link={link} ready={ready} />;
    case "video":
      return <ViewerVideo link={link} ready={ready} />;
    case "audio":
      return <ViewerAudio link={link} roomForArrows={roomForArrows} />;
    default:
      // Only media pearls are registered; nothing else reaches the viewer.
      return null;
  }
}

/** An image that can't be shown: the kind's icon on the tint (as on cards). */
function ImageTile({ style }: { style?: CSSProperties }) {
  return (
    <div
      data-viewer-media="fallback"
      className={cn(
        "flex items-center justify-center bg-muted",
        !style && "aspect-[16/10] w-[min(640px,100vw-32px)]",
      )}
      style={style}
    >
      <ImageIcon className="size-10 text-muted-foreground" aria-hidden />
    </div>
  );
}

/**
 * An image: the preview the card showed (already loaded, so it's what
 * travels in the morph), then the original over it, requested once the
 * morph has played (`ready`) and faded in on load. With a known size the
 * box is the image's ratio, as large as the viewer allows but never past
 * the image's own pixels; without one, the preview sizes it. A preview
 * that fails shows the icon tile (the original still gets its chance); an
 * original that fails leaves the preview, named for it.
 */
function ViewerImage({ link, ready }: { link: Link; ready: boolean }) {
  const preview = safeRemoteImgSrc(link.thumbnail ?? link.url);
  const original = safeRemoteImgSrc(link.url);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);
  const known = Boolean(link.width && link.height);

  const box: CSSProperties | undefined = known
    ? {
        aspectRatio: `${link.width} / ${link.height}`,
        width: `min(${link.width}px, ${MAX_WIDTH}, (${MAX_HEIGHT}) * ${link.width! / link.height!})`,
      }
    : undefined;
  const showOriginal = Boolean(original) && ready && !originalFailed;
  const showPreview = Boolean(preview) && !previewFailed;

  if (!showPreview && !showOriginal) return <ImageTile style={box} />;

  // The original names the image; until it's there (or if it never is),
  // the preview does.
  const previewNamed = !showOriginal || !loaded;

  return (
    <div
      data-viewer-media="image"
      className="relative"
      style={box ?? { maxHeight: MAX_HEIGHT }}
    >
      {showPreview ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-controlled media URLs; avoid next/image optimizer SSRF
        <img
          src={preview!}
          alt={previewNamed ? link.title : ""}
          decoding="async"
          draggable={false}
          referrerPolicy="strict-origin-when-cross-origin"
          className={cn(
            "object-contain",
            known ? "absolute inset-0 size-full" : "block max-h-[inherit] max-w-full",
          )}
          onError={() => setPreviewFailed(true)}
        />
      ) : (
        <ImageTile style={box} />
      )}
      {showOriginal ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-controlled media URLs; avoid next/image optimizer SSRF
        <img
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setLoaded(true);
          }}
          src={original!}
          alt={previewNamed ? "" : link.title}
          decoding="async"
          draggable={false}
          referrerPolicy="strict-origin-when-cross-origin"
          className={cn(
            "absolute inset-0 size-full object-contain transition-opacity duration-150 ease-out",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setOriginalFailed(true)}
        />
      ) : null}
    </div>
  );
}

/** The line under a video's poster when the file can't play. */
const CANT_PLAY = "Can't play this video";
/** Room for that line (`py-3` around a 20px line), kept off the video. */
const CANT_PLAY_HEIGHT = "2.75rem";
const MIN_RATIO = 1 / 3;
const MAX_RATIO = 3;

/** A video's width over height: its own (clamped like a card's), else 16:10. */
function videoRatio(link: Link): number {
  if (!link.width || !link.height) return 16 / 10;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, link.width / link.height));
}

/**
 * A video: the poster (`thumbnail`) travels in the morph, then the player
 * takes its place once the morph has played (`ready`): native controls,
 * with sound, playing at once (it was opened by a click) unless the reader
 * asked for reduced motion. A file that can't play keeps the poster and
 * the controls, with a line saying so under it. The box is the video's
 * ratio (16:10 when unknown; the file is fitted inside), as large as the
 * viewer allows. The player pauses as soon as the viewer closes, while the
 * box still morphs back into its card.
 */
function ViewerVideo({ link, ready }: { link: Link; ready: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const open = useIsMediaOpen(link.id);
  const src = safeRemoteImgSrc(link.url);
  const poster = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;
  const [failed, setFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  // Once the player has a frame of its own, the poster under it goes (so
  // it never shows around a video of another shape).
  const [hasFrame, setHasFrame] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // The failed player had focus: its replacement takes it.
  const refocus = useRef(false);
  const messageId = useId();
  const cantPlay = !src || failed;
  const ratio = videoRatio(link);
  const room = cantPlay ? `(${MAX_HEIGHT} - ${CANT_PLAY_HEIGHT})` : `(${MAX_HEIGHT})`;

  useEffect(() => {
    if (!open) videoRef.current?.pause();
  }, [open]);

  useLayoutEffect(() => {
    if (!failed || !refocus.current) return;
    refocus.current = false;
    videoRef.current?.focus({ preventScroll: true });
  }, [failed]);

  return (
    <div data-viewer-media="video" className="flex flex-col">
      <div
        className="relative bg-muted"
        style={{
          aspectRatio: String(ratio),
          width: `min(${MAX_WIDTH}, ${room} * ${ratio})`,
        }}
      >
        {/* Under the player: the poster until it plays (and if it never
            does), else the kind's icon. */}
        {hasFrame ? null : poster && !posterFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-controlled media URLs; avoid next/image optimizer SSRF
          <img
            src={poster}
            alt=""
            decoding="async"
            draggable={false}
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 size-full object-contain"
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <Video className="size-10 text-muted-foreground" aria-hidden />
          </span>
        )}
        {src && ready ? (
          // A failed player is replaced by an empty one (no source): WebKit
          // draws a failed player black, with a broken-play glyph, over its
          // poster, and keeps doing so after its source is removed. An empty
          // one shows the poster under its (idle) controls everywhere.
          <video
            key={failed ? "failed" : "file"}
            ref={videoRef}
            src={failed ? undefined : src}
            poster={poster ?? undefined}
            controls
            autoPlay={!reducedMotion && !failed}
            playsInline
            preload="metadata"
            aria-label={link.title}
            aria-describedby={failed ? messageId : undefined}
            className="absolute inset-0 size-full object-contain"
            onLoadedData={() => setHasFrame(true)}
            onError={() => {
              refocus.current = document.activeElement === videoRef.current;
              setFailed(true);
              // Mid-playback: back to the poster (or the icon) under it.
              setHasFrame(false);
            }}
          />
        ) : null}
      </div>
      {/* Always there, so the line is announced when it appears. */}
      <div role="status">
        {cantPlay ? (
          <p id={messageId} className="px-4 py-3 text-sm leading-5 text-muted-foreground">
            {CANT_PLAY}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * An audio pearl: the title, then the card's player at the viewer's size
 * (a 56px play button, the scrubber and the time), on the card's surface.
 * It has its own player, which starts stopped; the card's strip stopped
 * when the viewer opened (`MediaViewer`). With Previous / Next on its
 * sides (8px in, up to 40px wide on touch), 56px gutters on both sides keep
 * the player between them, the title lined up with it.
 */
function ViewerAudio({ link, roomForArrows }: { link: Link; roomForArrows: boolean }) {
  return (
    <div
      data-viewer-media="audio"
      className={cn(
        "flex w-[min(480px,100vw-32px)] flex-col gap-4 bg-card p-5 md:p-6",
        roomForArrows && "px-14 md:px-14",
      )}
    >
      {/* Clear of the close button in the top-right corner. */}
      <p className="line-clamp-2 pr-10 text-base leading-6 font-medium wrap-anywhere text-foreground">
        {link.title}
      </p>
      <AudioControls link={link} size="viewer" />
    </div>
  );
}
