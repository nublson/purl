"use client";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { linkKind } from "@/lib/link-kind";
import {
  markCloseSettled,
  markReturningFocus,
  mediaViewer,
  useMediaViewer,
} from "@/lib/media-viewer";
import { linkSecondLine } from "@/lib/upload-meta";
import { cn } from "@/lib/utils";
import type { DragOutcome } from "@/lib/viewer-drag";
import { Cambio } from "cambio";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { X } from "reicon-react";
import {
  FACE_LAYOUT_DEPENDENCY,
  MEDIA_RADIUS,
  VIEWER_LAYOUT_DEPENDENCY,
  pearlLayoutId,
} from "./media-face-anchor";
import {
  VIEWER_BUTTON,
  ViewerArrows,
  ViewerStage,
  ViewerStatus,
  viewerKeyMove,
  type MoveVia,
  type ViewerMove,
} from "./media-viewer-nav";
import {
  MAX_HEIGHT,
  MAX_WIDTH,
  ViewerEmbedHeader,
  ViewerMedia,
  preloadOriginal,
  preloadSrc,
} from "./media-viewer-media";
import { useBoxResize } from "./media-viewer-resize";

/** The box is centred in the room between the safe areas. */
const CENTER_TOP = "calc(50% + (env(safe-area-inset-top) - var(--bottom-inset)) / 2)";
const CENTER_LEFT =
  "calc(50% + (env(safe-area-inset-left) - env(safe-area-inset-right)) / 2)";

/** How long after the dialog opens an interrupted morph still makes `ready`. */
const READY_FALLBACK_MS = 1000;

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
  const { current, currentId, openedId, openedPreset, items, index, count, hasPrev, hasNext } =
    useMediaViewer();
  const reducedMotion = usePrefersReducedMotion();
  const [closing, setClosing] = useState<Closing | null>(null);
  if (closing && currentId === null) setClosing(null);

  const anchorId = closing && closing.step !== "release" ? closing.to : openedId;
  // Kept once the viewer has closed, so the exiting Popup's context (and
  // the focus return) still name the card it's going back to.
  const [lastAnchor, setLastAnchor] = useState(anchorId);
  if (anchorId !== null && anchorId !== lastAnchor) setLastAnchor(anchorId);
  const layoutId = pearlLayoutId(lastAnchor ?? "");

  // Declared before `requestClose`, which cancels a running resize.
  const popupRef = useRef<HTMLDivElement>(null);
  const { capture: captureBoxSize, cancel: cancelBoxResize } = useBoxResize(
    popupRef,
    currentId,
    reducedMotion,
  );

  const requestClose = useCallback(() => {
    cancelBoxResize();
    const state = mediaViewer.getSnapshot();
    if (state.currentId !== null && state.currentId !== state.openedId) {
      const to = state.currentId;
      setClosing((prev) => prev ?? { to, step: "release" });
    } else {
      mediaViewer.close();
    }
  }, [cancelBoxResize]);

  // Back closes through here too (`ViewerUrl.onPopState`), so it morphs
  // into the pearl shown, like Esc.
  useEffect(() => mediaViewer.setCloseRequest(requestClose), [requestClose]);

  useEffect(() => {
    if (!closing) return;
    const frame = requestAnimationFrame(() => {
      if (closing.step === "release") setClosing({ ...closing, step: "swap" });
      else if (closing.step === "swap") setClosing({ ...closing, step: "ready" });
      else mediaViewer.close();
    });
    return () => cancelAnimationFrame(frame);
  }, [closing]);

  // Focus goes back to the button of the pearl last shown (the one moved
  // to), else of the card the viewer closes into; read when the dialog lets
  // go of focus, after the store has closed. `morphInto` is that card.
  // Neither on the page (a deep-linked pearl the list doesn't show, or every
  // pearl gone in a live reload): the page's `<main>`, whose first tabbable
  // element Base UI focuses, rather than `<body>`.
  const shownLast = useRef<string | null>(null);
  const morphInto = useRef<string | null>(null);
  useEffect(() => {
    if (currentId !== null) shownLast.current = currentId;
  }, [currentId]);
  useEffect(() => {
    morphInto.current = lastAnchor;
  }, [lastAnchor]);
  const [finalFocus] = useState(() => ({
    get current(): HTMLElement | null {
      const button = (id: string | null) =>
        id
          ? document.querySelector<HTMLElement>(`[data-pearl-button="${CSS.escape(id)}"]`)
          : null;
      const target =
        button(shownLast.current) ??
        button(morphInto.current) ??
        document.querySelector<HTMLElement>("main");
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
  // Second path to `ready`, for a morph cut short (`onLayoutAnimationComplete`
  // never comes): the dialog's open completes ~30ms into the morph (Base UI
  // doesn't wait for Motion's JS-driven layout animation), so flipping
  // `ready` there would load the original mid-morph; instead it arms this
  // timer, longer than any preset's morph, which the morph's own completion
  // beats in the normal case.
  const readyFallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(readyFallback.current), []);
  const closed = currentId === null;
  if (closed && ready) setReady(false);

  // While it closes, the dialog stays drawn for the morph back
  // (`hidden={false}` below) but is gone for assistive tech and focus:
  // `inert`, plus `aria-hidden` for tools that don't read `inert` yet.
  // Set on the elements, since the exiting Popup's props are frozen.
  const backdropRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Each open and each close starts without a morph seen: an open with no
    // card to grow from (a deep link) is ready through the fallback below.
    morphStarted.current = false;
    clearTimeout(readyFallback.current);
    for (const el of [popupRef.current, backdropRef.current]) {
      if (!el) continue;
      el.inert = closed;
      if (closed) el.setAttribute("aria-hidden", "true");
      else el.removeAttribute("aria-hidden");
    }
  }, [closed]);

  // Moving between pearls (keys, buttons, swipes). The status says where
  // it went from the first move on (opening reads the dialog itself).
  const [moved, setMoved] = useState(false);
  if (closed && moved) setMoved(false);
  // How the last move was made: a key crossfades in place and the box
  // snaps to the new pearl (a held arrow repeats); a swipe leaves at its
  // own speed; an arrow button slides, the box resizing with it.
  const [via, setVia] = useState<MoveVia>("slide");
  const move = (to: ViewerMove, how: MoveVia = "slide") => {
    if (closing || closed) return;
    // Focus inside the leaving slide (a player's button) would go with it.
    const media = mediaRef.current;
    const active = document.activeElement;
    if (media && active instanceof HTMLElement && active !== media && media.contains(active)) {
      media.focus({ preventScroll: true });
    }
    setMoved(true);
    setVia(how);
    if (how !== "key") captureBoxSize();
    mediaViewer[to]();
  };
  const onDragOutcome = (outcome: DragOutcome) => {
    if (outcome === "close") requestClose();
    else if (outcome !== "none") move(outcome, "fling");
  };
  // A button that went away at an end (Next on the last pearl) had focus:
  // keep it in the viewer.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (currentId === null || !popup || popup.contains(document.activeElement)) return;
    mediaRef.current?.focus({ preventScroll: true });
  }, [currentId, hasPrev, hasNext]);

  // The neighbours' originals load ahead, once this pearl's own has had
  // its turn, so moving to them shows the file at once. Keyed on the files
  // themselves (each list reload is a new `items`), so each loads once.
  const prevSrc = hasPrev ? preloadSrc(items[index - 1]) : null;
  const nextSrc = hasNext ? preloadSrc(items[index + 1]) : null;
  useEffect(() => {
    if (!ready) return;
    preloadOriginal(prevSrc);
    preloadOriginal(nextSrc);
  }, [ready, prevSrc, nextSrc]);

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
        // With one, ready when it completes, or after the fallback (above)
        // if it was interrupted.
        if (open && !morphStarted.current) setReady(true);
        else if (open) {
          clearTimeout(readyFallback.current);
          readyFallback.current = setTimeout(() => setReady(true), READY_FALLBACK_MS);
        }
        // Closed: faces raised for the morph lower now, except the one it
        // morphs back into (none under reduced motion), which waits for it.
        if (!open) markCloseSettled(reducedMotion ? null : morphInto.current);
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
          onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
            const to = viewerKeyMove(event);
            if (!to) return;
            event.preventDefault();
            move(to, "key");
          }}
          onLayoutAnimationStart={() => {
            morphStarted.current = true;
          }}
          onLayoutAnimationComplete={() => setReady(true)}
          hidden={false}
          initialFocus={mediaRef}
          finalFocus={finalFocus}
          // Moving between pearls never morphs the box through Motion's
          // layout animation (that would stretch the sliding media); the
          // box resizes with the slide instead (`useBoxResize`).
          layoutDependency={
            closing && closing.step !== "ready" ? FACE_LAYOUT_DEPENDENCY : VIEWER_LAYOUT_DEPENDENCY
          }
          className="group/viewer z-50 flex w-max flex-col items-center justify-center overflow-hidden bg-card outline-none data-closed:pointer-events-none"
          style={{
            top: CENTER_TOP,
            left: CENTER_LEFT,
            maxWidth: MAX_WIDTH,
            maxHeight: MAX_HEIGHT,
            borderRadius: MEDIA_RADIUS,
          }}
        >
          {current ? (
            <>
              <Cambio.Title className="sr-only">{current.title}</Cambio.Title>
              <Cambio.Description className="sr-only">
                {linkSecondLine(current)}
              </Cambio.Description>
              <ViewerStatus
                text={moved ? `${index + 1} of ${count}: ${current.title}` : ""}
              />
              {/* A live page's header line, above its box (which leaves it
                  room under the viewer's height). */}
              {linkKind(current) === "embed" ? <ViewerEmbedHeader link={current} /> : null}
              {/* Positioned: the slide leaving is laid out against it. */}
              <div ref={mediaRef} tabIndex={-1} className="relative outline-none">
                <ViewerStage
                  id={current.id}
                  index={index}
                  hasPrev={hasPrev}
                  hasNext={hasNext}
                  reducedMotion={reducedMotion}
                  via={via}
                  onDragOutcome={onDragOutcome}
                >
                  <ViewerMedia link={current} ready={ready} />
                </ViewerStage>
              </div>
              <ViewerArrows hasPrev={hasPrev} hasNext={hasNext} onMove={move} />
              {/* No visible close button: Esc, a press outside the media, a
                  vertical swipe and Back close it. This one is for screen
                  readers (on a phone, swipes move between controls instead)
                  and shows only on keyboard focus. */}
              <Cambio.Close
                aria-label="Close"
                className={cn(
                  VIEWER_BUTTON,
                  "top-2 right-2 not-focus-visible:sr-only",
                )}
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
