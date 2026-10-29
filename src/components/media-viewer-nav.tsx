"use client";

import { EASE_OUT_STRONG, VIEWER_MOVE } from "@/lib/motion";
import { loadMotionFeatures } from "@/lib/motion-features-loader";
import { cn } from "@/lib/utils";
import { decideDrag, type DragOutcome } from "@/lib/viewer-drag";
import {
  AnimatePresence,
  LazyMotion,
  animate,
  m,
  useDragControls,
  useMotionValue,
  useTransform,
  type Variants,
} from "motion/react";
import { useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { ChevronLeft, ChevronRight } from "reicon-react";

/**
 * Moving between pearls inside the media viewer: the slide (and swipe) of
 * the media, the Previous / Next buttons, the live region and the keys.
 * The viewer (`media-viewer.tsx`) owns the state; this is its chrome.
 */
export type ViewerMove = "prev" | "next" | "first" | "last";

/**
 * The viewer's round buttons (Previous, Next): 32px with a mouse;
 * on touch screens 40px plus 2px of invisible hit area all round (`after:`),
 * so each target is 44px, as in the selection bar.
 */
export const VIEWER_BUTTON =
  "absolute z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm transition-[background-color,opacity,scale] duration-150 ease-out-strong outline-none active:scale-[0.96] motion-reduce:active:scale-100 after:absolute after:-inset-0.5 hover:bg-background focus-visible:ring-3 focus-visible:ring-ring pointer-coarse:size-10";

/** The keys the viewer moves with, and where each goes. */
const KEY_MOVES: Record<string, ViewerMove> = {
  ArrowLeft: "prev",
  ArrowRight: "next",
  Home: "first",
  End: "last",
};

/** Controls that use these keys themselves (a player seeking, a scrubber). */
const OWNS_KEYS = "video, audio, input, textarea, select, [contenteditable]";

/** The move a key press on the viewer asks for, or null to leave it alone. */
export function viewerKeyMove(event: KeyboardEvent<HTMLElement>): ViewerMove | null {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }
  const move = KEY_MOVES[event.key];
  if (!move) return null;
  const target = event.target;
  if (target instanceof Element && target.closest(OWNS_KEYS)) return null;
  return move;
}

/**
 * Previous / Next: on the media's sides, absent at the ends. Always shown
 * on touch screens; with a mouse, while the pointer is over the viewer or
 * a button has keyboard focus.
 */
export function ViewerArrows({
  hasPrev,
  hasNext,
  onMove,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  onMove: (move: ViewerMove) => void;
}) {
  const reveal =
    "top-1/2 -translate-y-1/2 opacity-0 group-hover/viewer:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100";
  return (
    <>
      {hasPrev ? (
        <button
          type="button"
          aria-label="Previous pearl"
          aria-keyshortcuts="ArrowLeft"
          className={cn(VIEWER_BUTTON, reveal, "left-2")}
          onClick={() => onMove("prev")}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      ) : null}
      {hasNext ? (
        <button
          type="button"
          aria-label="Next pearl"
          aria-keyshortcuts="ArrowRight"
          className={cn(VIEWER_BUTTON, reveal, "right-2")}
          onClick={() => onMove("next")}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      ) : null}
    </>
  );
}

/**
 * Where the viewer says which pearl it moved to ("2 of 12: Morning birds").
 * Inside the dialog: while it's open, the rest of the page is hidden from
 * assistive tech. Empty until the first move (opening reads the dialog).
 */
export function ViewerStatus({ text }: { text: string }) {
  return (
    <p role="status" data-viewer-status="" className="sr-only">
      {text}
    </p>
  );
}

/** Where a drag can't start: the player's own controls. */
const NOT_A_HANDLE = "video, input[type=range], button";

/** How far a drag goes before the media has shrunk all the way (px). */
const PULL_FOR_FULL_SCALE = 160;

/**
 * How the last move was made: a swipe (`fling`) leaves on a spring that
 * keeps the finger's speed; a key (`key`, which repeats when held) or
 * reduced motion crossfades in place; a click on an arrow slides.
 */
export type MoveVia = "slide" | "fling" | "key";
type SlideCustom = { direction: number; via: MoveVia; reducedMotion: boolean };

const fades = (custom: SlideCustom) => custom.reducedMotion || custom.via === "key";
/** A crossfade's two states would show through each other: a light blur masks it. */
const FADE_OUT = { opacity: 0, filter: "blur(2px)" };
const FADE_TRANSITION = { duration: 0.15, ease: EASE_OUT_STRONG };
/** A swipe's exit: a spring, so it carries on at the speed it was let go. */
const FLING_TRANSITION = { type: "spring", duration: 0.5, bounce: 0.2 } as const;

const STAGE: Variants = {
  enter: (custom: SlideCustom) =>
    fades(custom)
      ? { ...FADE_OUT, x: 0, transition: FADE_TRANSITION }
      : { x: custom.direction > 0 ? "100%" : "-100%", opacity: 1, filter: "blur(0px)" },
  center: (custom: SlideCustom) => ({
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: fades(custom) ? FADE_TRANSITION : VIEWER_MOVE,
  }),
  exit: (custom: SlideCustom) =>
    fades(custom)
      ? { ...FADE_OUT, transition: FADE_TRANSITION }
      : {
          x: custom.direction > 0 ? "-100%" : "100%",
          transition: custom.via === "fling" ? FLING_TRANSITION : VIEWER_MOVE,
        },
};

/**
 * The media, sliding in from the side it was moved to (a crossfade for a
 * key move and under reduced motion; a swipe's leaves on a spring at its
 * own speed), and the swipe: across moves, up or down closes
 * (`decideDrag`). Each pearl is its own slide, keyed by id, so the one
 * leaving slides out while the next slides in (`popLayout`: the leaving
 * one is taken out of the flow, so the viewer's box is the new pearl's).
 */
export function ViewerStage({
  id,
  index,
  hasPrev,
  hasNext,
  reducedMotion,
  via,
  onDragOutcome,
  children,
}: {
  id: string;
  index: number;
  /** How the move that showed this pearl was made. */
  via: MoveVia;
  hasPrev: boolean;
  hasNext: boolean;
  reducedMotion: boolean;
  onDragOutcome: (outcome: DragOutcome) => void;
  children: ReactNode;
}) {
  // Which way the last move went: forward slides in from the right.
  const [shown, setShown] = useState({ id, index, direction: 1, via });
  if (shown.id !== id) {
    setShown({ id, index, direction: index >= shown.index ? 1 : -1, via });
  }
  const custom: SlideCustom = { direction: shown.direction, via: shown.via, reducedMotion };

  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <AnimatePresence initial={false} mode="popLayout" custom={custom}>
        <ViewerSlide
          key={id}
          custom={custom}
          hasPrev={hasPrev}
          hasNext={hasNext}
          reducedMotion={reducedMotion}
          onDragOutcome={onDragOutcome}
        >
          {children}
        </ViewerSlide>
      </AnimatePresence>
    </LazyMotion>
  );
}

function ViewerSlide({
  ref,
  custom,
  hasPrev,
  hasNext,
  reducedMotion,
  onDragOutcome,
  children,
}: {
  /** From `AnimatePresence` (`popLayout` measures the slide it pops). */
  ref?: Ref<HTMLDivElement>;
  custom: SlideCustom;
  hasPrev: boolean;
  hasNext: boolean;
  reducedMotion: boolean;
  onDragOutcome: (outcome: DragOutcome) => void;
  children: ReactNode;
}) {
  const controls = useDragControls();
  const lock = useRef<"x" | "y" | null>(null);
  // How far the drag has gone on its axis; the media shrinks to 0.95.
  const pull = useMotionValue(0);
  const scale = useTransform(pull, [0, PULL_FOR_FULL_SCALE], [1, reducedMotion ? 1 : 0.95]);

  return (
    <m.div
      ref={ref}
      custom={custom}
      variants={STAGE}
      initial="enter"
      animate="center"
      exit="exit"
      drag
      dragListener={false}
      dragControls={controls}
      dragDirectionLock
      dragSnapToOrigin
      dragElastic={0.2}
      // Past the first or last pearl, the media only gives a little.
      dragConstraints={{ left: hasNext ? undefined : 0, right: hasPrev ? undefined : 0 }}
      onPointerDown={(event) => {
        // The main button (or a touch, or a pen's tip) of the first pointer.
        if (event.button !== 0 || !event.isPrimary) return;
        const target = event.target;
        if (target instanceof Element && target.closest(NOT_A_HANDLE)) return;
        // Reset here: Motion locks the axis before it calls `onDragStart`.
        lock.current = null;
        controls.start(event);
      }}
      onDirectionLock={(axis) => {
        lock.current = axis;
      }}
      onDrag={(_, info) => {
        if (lock.current) pull.set(Math.abs(info.offset[lock.current]));
      }}
      onDragEnd={(_, info) => {
        const outcome = decideDrag(info.offset, info.velocity, lock.current);
        lock.current = null;
        animate(pull, 0, VIEWER_MOVE);
        onDragOutcome(outcome);
      }}
      style={{ scale }}
      // `touch-none` is ours, not Motion's: Motion writes `touch-action` only
      // when it listens for the drag itself (not with `dragListener={false}`).
      // It keeps the browser's pan and pinch from cancelling the swipe, and
      // is why a pinch doesn't zoom here; dropping it breaks the swipe.
      className="touch-none select-none"
    >
      {children}
    </m.div>
  );
}
