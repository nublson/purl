"use client";

import { audioPlayerStore, viewerAudioId } from "@/hooks/use-audio-player";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { linkKind } from "@/lib/link-kind";
import {
  markReturningFocus,
  mediaViewer,
  useIsMediaOpen,
  useMediaViewer,
} from "@/lib/media-viewer";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { linkSecondLine } from "@/lib/upload-meta";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { Cambio } from "cambio";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Image as ImageIcon, Video, X } from "reicon-react";
import { AudioControls } from "./media-card-face";
import { FACE_LAYOUT_DEPENDENCY, MEDIA_RADIUS, pearlLayoutId } from "./media-face-anchor";

/** The viewer's box: 16px from every edge (and the safe areas), 1200px at most. */
const MAX_WIDTH =
  "min(100vw - 32px - env(safe-area-inset-left) - env(safe-area-inset-right), 1200px)";
const MAX_HEIGHT =
  "calc(100dvh - 32px - env(safe-area-inset-top) - env(safe-area-inset-bottom))";

/**
 * Closing onto another pearl's card (after next/previous): Motion reads a
 * `layoutId` only when an element mounts, so the Popup is remounted under
 * the pearl it shows before it closes. Each step takes a frame:
 * - `release`: the Popup takes the faces' `layoutDependency`, so leaving
 *   its first card morphs nothing (that card just shows again);
 * - `swap`: it remounts under the shown pearl's `layoutId`, with the same
 *   dependency, so it appears in place (Motion hides that card);
 * - `ready`: it drops the dependency, so closing morphs it into the card.
 */
type Closing = { to: string; step: "release" | "swap" | "ready" };

/**
 * The media viewer: one dialog for every pearl on the page, morphing out of
 * the card it opened from (`MediaAnchor`, same `layoutId`) and back into the
 * card of the pearl it shows when it closes. State lives in `mediaViewer`;
 * the URL in `useMediaViewerUrl`. Loaded on demand (`MediaViewerLazy`).
 */
export function MediaViewer() {
  const { current, currentId, openedId, openedPreset } = useMediaViewer();
  const [closing, setClosing] = useState<Closing | null>(null);
  if (closing && currentId === null) setClosing(null);

  const anchorId = closing && closing.step !== "release" ? closing.to : openedId;
  // Kept once the viewer has closed, so the exiting Popup's context (and
  // the focus return) still name the card it's going back to.
  const [lastAnchor, setLastAnchor] = useState(anchorId);
  if (anchorId !== null && anchorId !== lastAnchor) setLastAnchor(anchorId);
  const layoutId = pearlLayoutId(lastAnchor ?? "");

  const requestClose = useCallback(() => {
    const state = mediaViewer.getSnapshot();
    if (state.currentId !== null && state.currentId !== state.openedId) {
      const to = state.currentId;
      setClosing((prev) => prev ?? { to, step: "release" });
    } else {
      mediaViewer.close();
    }
  }, []);

  useEffect(() => {
    if (!closing) return;
    const frame = requestAnimationFrame(() => {
      if (closing.step === "release") setClosing({ ...closing, step: "swap" });
      else if (closing.step === "swap") setClosing({ ...closing, step: "ready" });
      else mediaViewer.close();
    });
    return () => cancelAnimationFrame(frame);
  }, [closing]);

  // Focus goes back to the button of the card the viewer closes into (read
  // when the dialog lets go of focus, after the store has closed).
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    returnTo.current = lastAnchor;
  }, [lastAnchor]);
  const [finalFocus] = useState(() => ({
    get current(): HTMLElement | null {
      const id = returnTo.current;
      const target = id
        ? document.querySelector<HTMLElement>(`[data-pearl-button="${CSS.escape(id)}"]`)
        : null;
      // Read as focus goes back: the row it lands on mustn't take it for
      // keyboard navigation (no hover preview over the morph back).
      if (target) markReturningFocus();
      return target;
    },
  }));
  const mediaRef = useRef<HTMLDivElement>(null);

  // The original file loads only once the morph has played (`ready`), so
  // the preview the card already showed is what travels; reset each open.
  const [ready, setReady] = useState(false);
  const morphStarted = useRef(false);
  const closed = currentId === null;
  if (closed && ready) setReady(false);

  // While it closes, the dialog stays drawn for the morph back
  // (`hidden={false}` below) but is gone for assistive tech and focus:
  // `inert`, plus `aria-hidden` for tools that don't read `inert` yet.
  // Set on the elements, since the exiting Popup's props are frozen.
  const popupRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Each open and each close starts without a morph seen: an open with no
    // card to grow from (a deep link) is ready through the fallback below.
    morphStarted.current = false;
    for (const el of [popupRef.current, backdropRef.current]) {
      if (!el) continue;
      el.inert = closed;
      if (closed) el.setAttribute("aria-hidden", "true");
      else el.removeAttribute("aria-hidden");
    }
  }, [closed]);

  // Playback hand-off: the viewer starts fresh, so the card's audio strip
  // stops when the viewer shows its pearl (the card's video loop pauses on
  // its own, `useIsMediaOpen`); leaving a pearl stops the viewer's player.
  useEffect(() => {
    if (currentId === null) return;
    audioPlayerStore.stop(currentId);
    return () => audioPlayerStore.stop(viewerAudioId(currentId));
  }, [currentId]);

  return (
    <Cambio.Root
      open={currentId !== null}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
      layoutId={layoutId}
      motion={openedPreset}
      dismissible={false}
      modal
      onOpenChangeComplete={(open: boolean) => {
        // No morph (no card to grow from): ready once the dialog is open.
        if (open && !morphStarted.current) setReady(true);
      }}
    >
      <Cambio.Portal>
        {/* `hidden={false}`: Base UI hides a closed dialog's parts at once
            (Tailwind's `[hidden]` rule is !important), while Motion still
            fades the backdrop and morphs the Popup back into its card. */}
        <Cambio.Backdrop
          ref={backdropRef}
          hidden={false}
          className="fixed inset-0 z-50 bg-background/85 backdrop-blur-[12px] data-closed:pointer-events-none"
        />
        <Cambio.Popup
          key={layoutId}
          data-media-viewer=""
          ref={popupRef}
          onLayoutAnimationStart={() => {
            morphStarted.current = true;
          }}
          onLayoutAnimationComplete={() => setReady(true)}
          hidden={false}
          initialFocus={mediaRef}
          finalFocus={finalFocus}
          layoutDependency={
            closing && closing.step !== "ready" ? FACE_LAYOUT_DEPENDENCY : undefined
          }
          className="z-50 w-max overflow-hidden bg-card outline-none data-closed:pointer-events-none"
          style={{ maxWidth: MAX_WIDTH, maxHeight: MAX_HEIGHT, borderRadius: MEDIA_RADIUS }}
        >
          {current ? (
            <>
              <Cambio.Title className="sr-only">{current.title}</Cambio.Title>
              <Cambio.Description className="sr-only">
                {linkSecondLine(current)}
              </Cambio.Description>
              <div ref={mediaRef} tabIndex={-1} className="outline-none">
                <ViewerMedia key={current.id} link={current} ready={ready} />
              </div>
              <Cambio.Close
                aria-label="Close"
                className="absolute top-2 right-2 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm transition-colors duration-150 ease-out outline-none after:absolute after:-inset-0.5 hover:bg-background focus-visible:ring-3 focus-visible:ring-ring pointer-coarse:size-10"
              >
                <X className="size-4" aria-hidden />
              </Cambio.Close>
            </>
          ) : null}
        </Cambio.Popup>
      </Cambio.Portal>
    </Cambio.Root>
  );
}

function ViewerMedia({ link, ready }: { link: Link; ready: boolean }) {
  switch (linkKind(link)) {
    case "image":
      return <ViewerImage link={link} ready={ready} />;
    case "video":
      return <ViewerVideo link={link} ready={ready} />;
    case "audio":
      return <ViewerAudio link={link} />;
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
  const messageId = useId();
  const cantPlay = !src || failed;
  const ratio = videoRatio(link);
  const room = cantPlay ? `(${MAX_HEIGHT} - ${CANT_PLAY_HEIGHT})` : `(${MAX_HEIGHT})`;

  useEffect(() => {
    if (!open) videoRef.current?.pause();
  }, [open]);


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
            onError={() => setFailed(true)}
          />
        ) : null}
      </div>
      {cantPlay ? (
        <p id={messageId} className="px-4 py-3 text-sm leading-5 text-muted-foreground">
          {CANT_PLAY}
        </p>
      ) : null}
    </div>
  );
}

/**
 * An audio pearl: the title, then the card's player at the viewer's size
 * (a 56px play button, the scrubber and the time), on the card's surface.
 * It has its own player, which starts stopped; the card's strip stopped
 * when the viewer opened (`MediaViewer`).
 */
function ViewerAudio({ link }: { link: Link }) {
  return (
    <div
      data-viewer-media="audio"
      className="flex w-[min(480px,100vw-32px)] flex-col gap-4 bg-card p-5 md:p-6"
    >
      {/* Clear of the close button in the top-right corner. */}
      <p className="line-clamp-2 pr-10 text-base leading-6 font-medium wrap-anywhere text-foreground">
        {link.title}
      </p>
      <AudioControls link={link} size="viewer" />
    </div>
  );
}
