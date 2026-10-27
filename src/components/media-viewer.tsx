"use client";

import { linkKind } from "@/lib/link-kind";
import { mediaViewer, useMediaViewer } from "@/lib/media-viewer";
import { safeRemoteImgSrc } from "@/lib/safe-remote-img-url";
import { linkSecondLine } from "@/lib/upload-meta";
import { cn } from "@/lib/utils";
import type { Link } from "@/utils/links";
import { Cambio } from "cambio";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
    >
      <Cambio.Portal>
        {/* `hidden={false}`: Base UI hides a closed dialog's parts at once
            (Tailwind's `[hidden]` rule is !important), while Motion still
            fades the backdrop and morphs the Popup back into its card. */}
        <Cambio.Backdrop
          hidden={false}
          className="fixed inset-0 z-50 bg-background/85 backdrop-blur-[12px] data-closed:pointer-events-none"
        />
        <Cambio.Popup
          key={layoutId}
          data-media-viewer=""
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
                <ViewerMedia key={current.id} link={current} />
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

function ViewerMedia({ link }: { link: Link }) {
  switch (linkKind(link)) {
    case "image":
      return <ViewerImage link={link} />;
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

/**
 * An image: the preview the card showed (already loaded, so it's what
 * travels in the morph), under the original, which fades in once loaded.
 * With a known size the box is the image's ratio, as large as the viewer
 * allows but never past the image's own pixels; without one, the preview
 * sizes it.
 */
function ViewerImage({ link }: { link: Link }) {
  const preview = safeRemoteImgSrc(link.thumbnail ?? link.url);
  const original = safeRemoteImgSrc(link.url);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const known = Boolean(link.width && link.height);

  if (!preview && !original) {
    return (
      <div className="flex aspect-[16/10] w-[min(640px,100vw-32px)] items-center justify-center bg-muted">
        <ImageIcon className="size-10 text-muted-foreground" aria-hidden />
      </div>
    );
  }

  const box: CSSProperties | undefined = known
    ? {
        aspectRatio: `${link.width} / ${link.height}`,
        width: `min(${link.width}px, ${MAX_WIDTH}, (${MAX_HEIGHT}) * ${link.width! / link.height!})`,
      }
    : { maxHeight: MAX_HEIGHT };

  return (
    <div data-viewer-media="image" className="relative" style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element -- user-controlled media URLs; avoid next/image optimizer SSRF */}
      <img
        src={preview ?? original!}
        alt=""
        decoding="async"
        draggable={false}
        referrerPolicy="strict-origin-when-cross-origin"
        className={cn(
          "object-contain",
          known ? "absolute inset-0 size-full" : "block max-h-[inherit] max-w-full",
        )}
      />
      {original && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-controlled media URLs; avoid next/image optimizer SSRF
        <img
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setLoaded(true);
          }}
          src={original}
          alt={link.title}
          decoding="async"
          draggable={false}
          referrerPolicy="strict-origin-when-cross-origin"
          className={cn(
            "absolute inset-0 size-full object-contain transition-opacity duration-150 ease-out",
            loaded ? "opacity-100" : "opacity-0",
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}
