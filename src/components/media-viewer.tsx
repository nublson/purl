"use client";

import { linkKind } from "@/lib/link-kind";
import { mediaViewer, useMediaViewer } from "@/lib/media-viewer";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { linkSecondLine } from "@/lib/upload-meta";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { Cambio } from "cambio";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Image as ImageIcon, X } from "reicon-react";
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
      return id
        ? document.querySelector<HTMLElement>(`[data-pearl-button="${CSS.escape(id)}"]`)
        : null;
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
    if (closed) morphStarted.current = false;
    for (const el of [popupRef.current, backdropRef.current]) {
      if (!el) continue;
      el.inert = closed;
      if (closed) el.setAttribute("aria-hidden", "true");
      else el.removeAttribute("aria-hidden");
    }
  }, [closed]);

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
    default:
      // Video and audio arrive with the next step; until then, a quiet box.
      return (
        <div
          data-viewer-media="placeholder"
          className="flex aspect-[16/10] w-[min(640px,100vw-32px)] items-center justify-center bg-muted"
        />
      );
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
