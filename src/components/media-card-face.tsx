"use client";

import { audioPlayerStore, useAudioPlayer } from "@/hooks/use-audio-player";
import { useLiveCards } from "@/hooks/use-live-cards";
import { usePlayVideos } from "@/contexts/link-view-context";
import { cardAspectRatio } from "@/lib/link-kind";
import { useIsSelectionActive } from "@/lib/link-selection";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/utils/format-duration";
import { MediaAnchor } from "./media-face-anchor";
import type { Link } from "@/utils/links";
import { Image as ImageIcon, Pause, Play, Video } from "reicon-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type SyntheticEvent,
} from "react";

type FaceProps = {
  link: Link;
  /** Overrides the box (the hover preview's corners and height). */
  className?: string;
  /** Drawn over the media's bottom-left corner (the owner's folder badge). */
  badge?: ReactNode;
};

/** The ratio the media reports once loaded, clamped like a known one. */
function naturalRatio(width: number, height: number): string {
  return cardAspectRatio({ width, height });
}

/** The folder badge's corner over a face: an 8px inset, like a favicon's. */
function FaceBadge({ badge }: { badge: ReactNode }) {
  if (!badge) return null;
  // The badge hangs 4px off its box's bottom-end corner.
  return <span className="pointer-events-none absolute bottom-3 left-3 size-1">{badge}</span>;
}

/**
 * An image pearl: the preview (`thumbnail`), else the file itself, full-bleed
 * at its own ratio. A media link of unknown size starts at 16:10 and takes
 * the image's ratio once it loads. A failed image shows the page card's
 * fallback (the favicon on a tint), never a broken image.
 */
export function ImageFace({
  link,
  eager = false,
  className,
  badge,
  anchored = false,
}: FaceProps & {
  eager?: boolean;
  /**
   * The media viewer opens from this face (the owner's grid): its box is
   * the viewer's morph anchor (`MediaAnchor`).
   */
  anchored?: boolean;
}) {
  const src = safeRemoteImgSrc(link.thumbnail ?? link.url);
  if (!src) {
    return (
      <AnchorIf link={link} anchored={anchored}>
        <ImageFallback ratio={cardAspectRatio(link)} className={className} badge={badge} />
      </AnchorIf>
    );
  }
  return (
    <ImageFaceImg
      key={src}
      link={link}
      src={src}
      eager={eager}
      className={className}
      badge={badge}
      anchored={anchored}
    />
  );
}

/** Wraps a face's box in `MediaAnchor` when the viewer opens from it. */
function AnchorIf({
  link,
  anchored,
  children,
}: {
  link: Link;
  anchored: boolean;
  children: ReactNode;
}) {
  return anchored ? <MediaAnchor link={link}>{children}</MediaAnchor> : children;
}

function ImageFaceImg({
  link,
  src,
  eager,
  className,
  badge,
  anchored,
}: FaceProps & { src: string; eager: boolean; anchored: boolean }) {
  const known = Boolean(link.width && link.height);
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const [natural, setNatural] = useState<string | null>(null);

  const settle = (img: HTMLImageElement) => {
    if (img.naturalWidth > 0) {
      setState("loaded");
      if (!known) setNatural(naturalRatio(img.naturalWidth, img.naturalHeight));
    } else {
      setState("failed");
    }
  };

  // A server-rendered image can finish (or fail) before React hydrates and
  // attaches onLoad / onError: read where it ended up.
  const ref = (img: HTMLImageElement | null) => {
    if (img?.complete && state === "loading") settle(img);
  };

  if (state === "failed") {
    return (
      <AnchorIf link={link} anchored={anchored}>
        <ImageFallback
          ratio={natural ?? cardAspectRatio(link)}
          className={className}
          badge={badge}
        />
      </AnchorIf>
    );
  }

  return (
    <AnchorIf link={link} anchored={anchored}>
      <div
        data-face="image"
        className={cn(
          "relative w-full overflow-hidden",
          state === "loading" && "bg-muted",
          className,
        )}
        style={{ aspectRatio: natural ?? cardAspectRatio(link) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- user-controlled media URLs; avoid next/image optimizer SSRF */}
        <img
          ref={ref}
          src={src}
          alt=""
          width={link.width ?? undefined}
          height={link.height ?? undefined}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="strict-origin-when-cross-origin"
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-150 ease-out",
            state === "loaded" ? "opacity-100" : "opacity-0",
          )}
          onLoad={(event) => settle(event.currentTarget)}
          onError={() => setState("failed")}
        />
        <FaceBadge badge={badge} />
      </div>
    </AnchorIf>
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the reader asked for reduced motion (true until hydration). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

/**
 * A video pearl: the file, muted and looping, full-bleed at its ratio, with
 * the poster (`thumbnail`) until it plays. It plays while it holds one of the
 * page's live slots (`useLiveCards`: in view, a few at a time); under reduced
 * motion, or with "Play videos" off in the user menu, it stays on its poster
 * and plays only while hovered. The length
 * sits in a pill in the bottom-right corner.
 */
export function VideoFace({ link, className, badge }: FaceProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  // The account's "Play videos" (off: play on hover only, like reduced motion).
  const playVideos = usePlayVideos();
  const [hovering, setHovering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState<string | null>(null);
  const known = Boolean(link.width && link.height);
  const src = safeRemoteImgSrc(link.url);
  const poster = link.thumbnail ? safeRemoteImgSrc(link.thumbnail) : null;

  const live = useLiveCards(
    boxRef,
    Boolean(src) && !failed && ((playVideos && !reducedMotion) || hovering),
  );

  // React sets `muted` as a property only; `defaultMuted` also writes the
  // attribute, which some browsers check before letting a video autoplay.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultMuted = true;
    video.muted = true;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (live) {
      // Rejected when the browser refuses or the file can't play: it keeps
      // its poster.
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [live]);

  // Hover is the card's (its content doesn't take pointer events in the
  // owner's grid), else the face's own (the hover preview).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const target = box.closest<HTMLElement>('[data-cy="link-card"]') ?? box;
    const enter = (event: PointerEvent) => {
      if (event.pointerType !== "touch") setHovering(true);
    };
    const leave = () => setHovering(false);
    target.addEventListener("pointerenter", enter);
    target.addEventListener("pointerleave", leave);
    return () => {
      target.removeEventListener("pointerenter", enter);
      target.removeEventListener("pointerleave", leave);
    };
  }, []);

  function onLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (!known && video.videoWidth > 0 && video.videoHeight > 0) {
      setNatural(naturalRatio(video.videoWidth, video.videoHeight));
    }
  }

  return (
    <div
      ref={boxRef}
      data-face="video"
      className={cn("relative w-full overflow-hidden bg-muted", className)}
      style={{ aspectRatio: natural ?? cardAspectRatio(link) }}
    >
      {src ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
          tabIndex={-1}
          className="absolute inset-0 size-full object-cover"
          onLoadedMetadata={onLoadedMetadata}
          onError={() => setFailed(true)}
        />
      ) : null}
      {/* Nothing to show (no file, or it failed, and no poster): the kind's
          icon on the tint. */}
      {!src || (failed && !poster) ? (
        <span className="absolute inset-0 flex items-center justify-center bg-muted">
          <Video className="size-10 text-muted-foreground" aria-hidden />
        </span>
      ) : null}
      {link.duration != null ? (
        <span
          aria-hidden
          // 6px in from the card's 8px corners, so its 2px radius is concentric.
          className="pointer-events-none absolute right-1.5 bottom-1.5 rounded-[2px] bg-black/60 px-1.5 py-0.5 text-xs leading-4 font-medium text-white tabular-nums backdrop-blur-sm">
          {formatDuration(link.duration)}
        </span>
      ) : null}
      <FaceBadge badge={badge} />
    </div>
  );
}

/**
 * An audio pearl's player strip, on the card's tint: play/pause, elapsed
 * over the length, and a scrubber. One `<audio preload="none">` (nothing
 * loads until played), wired to `useAudioPlayer`, so starting one stops the
 * other. With `controls`, the top keeps room for the owner's checkbox and
 * menu (the shared card and the hover preview have none).
 */
export function AudioFace({
  link,
  className,
  controls = false,
}: Omit<FaceProps, "badge"> & { controls?: boolean }) {
  const { playing, toggle } = useAudioPlayer(link.id);
  // While links are selected, a click on the card toggles it: the controls
  // step aside (the shared card never selects).
  const selecting = useIsSelectionActive();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [length, setLength] = useState<number | null>(link.duration);
  const src = safeRemoteImgSrc(link.url);
  const id = link.id;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.play().catch((error: unknown) => {
        // A pause() that cut the play short isn't a failure.
        if ((error as { name?: string } | null)?.name !== "AbortError") {
          audioPlayerStore.stop(id);
        }
      });
    } else {
      audio.pause();
    }
  }, [playing, id]);

  // A card that leaves (deleted, moved, remounted) stops its sound, so it
  // never starts again on its own.
  useEffect(() => () => audioPlayerStore.stop(id), [id]);

  function readLength(event: SyntheticEvent<HTMLAudioElement>) {
    const { duration } = event.currentTarget;
    if (Number.isFinite(duration) && duration > 0) setLength(duration);
  }

  const time = length
    ? `${formatDuration(elapsed)} / ${formatDuration(length)}`
    : formatDuration(elapsed);

  return (
    <div
      data-face="audio"
      className={cn(
        "flex flex-col bg-muted px-3 pb-3 md:px-4",
        controls ? "pt-10" : "pt-4",
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="none"
        onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
        onLoadedMetadata={readLength}
        onDurationChange={readLength}
        // Paused from outside (media keys) or at the end: the store follows.
        onPause={() => audioPlayerStore.stop(id)}
        onEnded={(event) => {
          audioPlayerStore.stop(id);
          event.currentTarget.currentTime = 0;
          setElapsed(0);
        }}
        onError={() => audioPlayerStore.stop(id)}
      />
      {/* The controls take pointer events inside the owner's card (whose
          content doesn't), except while selecting, and never open the link
          they sit in (the shared card is one link). `data-card-menu`: a
          press here isn't the card's long-press. */}
      <div
        data-card-menu
        inert={selecting}
        className={cn(
          "relative z-[1] flex items-center gap-3",
          selecting ? "pointer-events-none" : "pointer-events-auto",
        )}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <button
          type="button"
          disabled={!src}
          aria-label={`${playing ? "Pause" : "Play"} ${link.title}`}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background outline-none transition-[scale] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100"
          onClick={toggle}
        >
          {playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4 translate-x-px" aria-hidden />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            type="range"
            min={0}
            max={length ?? 0}
            step="any"
            value={Math.min(elapsed, length ?? 0)}
            disabled={!src || !length}
            aria-label={`Seek ${link.title}`}
            aria-valuetext={time}
            className="h-4 w-full cursor-pointer accent-foreground disabled:cursor-default"
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              setElapsed(next);
              if (audioRef.current) audioRef.current.currentTime = next;
            }}
          />
          {/* `text-foreground/70`, like Kbd: `text-muted-foreground` on
              `bg-muted` is 4.3:1 in light mode, under 4.5:1 for 12px text. */}
          <span className="text-xs leading-4 text-foreground/70 tabular-nums">
            {time}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * An image that can't be shown: the kind's icon on the tint, at the face's
 * ratio (never a broken image), with the folder badge kept.
 */
function ImageFallback({
  ratio,
  className,
  badge,
}: {
  ratio: string;
  className?: string;
  badge?: ReactNode;
}) {
  return (
    <div
      data-face="image"
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden bg-muted",
        className,
      )}
      style={{ aspectRatio: ratio }}
    >
      <ImageIcon className="size-10 text-muted-foreground" aria-hidden />
      <FaceBadge badge={badge} />
    </div>
  );
}
