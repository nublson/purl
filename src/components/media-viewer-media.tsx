"use client";

import { useAudioPlayer } from "@/hooks/use-audio-player";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { linkKind } from "@/lib/link-kind";
import { useIsMediaOpen } from "@/lib/media-viewer";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { linkSecondLine } from "@/lib/upload-meta";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/utils/format-duration";
import type { Link } from "@/utils/links";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Export5, Image as ImageIcon, Restart, Video } from "reicon-react";
import { AUDIO_PLAYER, AudioSleeve, AudioTrack } from "./audio-bar";
import { PlayMark } from "./play-mark";

// What the media viewer (`media-viewer.tsx`) shows of a pearl: an image,
// a video's player or an audio player, sized for the viewer.

/**
 * The viewer's box: 16px from every edge, inside the safe areas (the
 * notch, the home indicator: `--bottom-inset`), 1200px at most.
 */
export const MAX_WIDTH =
  "min(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right), 1200px)";
export const MAX_HEIGHT = "calc(100dvh - 32px - env(safe-area-inset-top) - var(--bottom-inset))";

/** The file to load ahead for a pearl (an image's original, a video's poster). */
export function preloadSrc(link: Link | null | undefined): string | null {
  if (!link) return null;
  const kind = linkKind(link);
  return kind === "image"
    ? safeRemoteImgSrc(link.url)
    : kind === "video" && link.thumbnail
      ? safeRemoteImgSrc(link.thumbnail)
      : null;
}

/** Starts loading a pearl's file (`preloadSrc`). */
export function preloadOriginal(src: string | null) {
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
 * A small image's box is scaled up to this on its shorter side (the image
 * fitted inside, at its ratio), so the X and the arrows never cover it.
 */
export const MIN_IMAGE_SIDE = 240;

/**
 * An image: the preview the card showed (already loaded, so it's what
 * travels in the morph), then the original over it, requested once the
 * morph has played (`ready`) and faded in on load. With a known size the
 * box is the image's ratio, as large as the viewer allows but never past
 * the image's own pixels, except that a small one is scaled up to
 * `MIN_IMAGE_SIDE` on its shorter side; without one, the preview sizes it. A preview
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

  const ratio = known ? link.width! / link.height! : 1;
  // Its own pixels, but at least `MIN_IMAGE_SIDE` on the shorter side.
  const natural = `max(${link.width}px, ${MIN_IMAGE_SIDE * Math.max(ratio, 1)}px)`;
  const box: CSSProperties | undefined = known
    ? {
        aspectRatio: `${link.width} / ${link.height}`,
        width: `min(${natural}, ${MAX_WIDTH}, (${MAX_HEIGHT}) * ${ratio})`,
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

/** The opened player's side buttons (Restart, Open file): 34px, outlined, 44px to the touch. */
const SIDE_BUTTON =
  "relative flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-foreground/70 outline-none transition-[background-color,color,scale] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100 pointer-coarse:after:absolute pointer-coarse:after:-inset-[5px]";

/**
 * An audio pearl: the card's now-playing bar, opened. The sleeve (64px)
 * with the words beside it, clear of the Close button; under them the
 * track with elapsed and remaining; then the transport, centred: Restart,
 * Play (the drawn mark) and Open file (the row menu's item, a link). 320px
 * wide and as tall as its stack (`AUDIO_PLAYER`). It's a view of the
 * page's one player (`useAudioPlayer`), like the card's bar, so a pearl
 * playing on its card plays on here, and on the card after closing. With
 * Previous / Next on its sides (8px in, 32px wide; 40px on touch, where
 * the content keeps the same 8px from them) the content narrows so they
 * never cover the track's ends or the transport.
 */
function ViewerAudio({ link, roomForArrows }: { link: Link; roomForArrows: boolean }) {
  const { playing, elapsed, length, toggle, restart } = useAudioPlayer(link.id, link.duration);
  const reducedMotion = usePrefersReducedMotion();
  const src = safeRemoteImgSrc(link.url);

  return (
    <div
      data-viewer-media="audio"
      className={cn(
        "flex w-[min(320px,100vw-32px)] flex-col bg-card p-[10px]",
        roomForArrows && "px-12 pointer-coarse:px-14",
      )}
    >
      <div className="flex items-center gap-2.5">
        <AudioSleeve link={link} size={AUDIO_PLAYER.sleeve} radius={AUDIO_PLAYER.sleeveRadius} />
        {/* Clear of the Close button in the top-right corner (the arrows'
            padding already is). */}
        <div data-words className={cn("flex min-w-0 flex-1 flex-col", !roomForArrows && "pr-9")}>
          <span className="truncate text-[15.5px] leading-[19px] font-medium text-foreground">
            {link.title}
          </span>
          {/* `text-foreground/70`, like the bar's: `text-muted-foreground`
              on the card's tint is under 4.5:1 for small text in light mode. */}
          <span className="truncate text-xs leading-[15px] text-foreground/70">
            {linkSecondLine(link)}
          </span>
        </div>
      </div>
      <AudioTrack
        link={link}
        className="mt-[22px]"
        // 44px to the touch, centred on the rail: clear of the sleeve above
        // and the transport below.
        rangeClassName="pointer-coarse:h-11"
      />
      {/* Plain text, not a live region: the range's value says the same. */}
      <div
        data-times=""
        className="mt-2 flex h-2.5 items-center justify-between text-[11px] leading-none text-foreground/70 tabular-nums"
      >
        <span data-elapsed="">{formatDuration(elapsed)}</span>
        <span data-remaining="">
          {length ? `−${formatDuration(Math.max(0, length - elapsed))}` : null}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-center gap-3.5">
        <button
          type="button"
          disabled={!src}
          aria-label={`Restart ${link.title}`}
          className={SIDE_BUTTON}
          onClick={restart}
        >
          <Restart className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled={!src}
          aria-label={`${playing ? "Pause" : "Play"} ${link.title}`}
          className="flex size-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background outline-none transition-[scale] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring active:scale-[0.96] disabled:cursor-default disabled:opacity-50 motion-reduce:active:scale-100"
          onClick={() => {
            if (src) toggle(src);
          }}
        >
          <PlayMark playing={playing} size={18} reducedMotion={reducedMotion} />
        </button>
        {/* A real link, like the row menu's item: Cmd/Ctrl-click and the
            browser's own link handling work as on any link. */}
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open file"
          className={SIDE_BUTTON}
        >
          <Export5 className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
