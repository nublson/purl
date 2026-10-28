"use client";

import { EASE_OUT_STRONG } from "@/lib/motion";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

/** The box resizes with the slide: the same length and curve. */
const RESIZE_TRANSITION = { duration: 0.2, ease: EASE_OUT_STRONG };

/**
 * Resizes the viewer's box from the pearl it showed to the one it moves to,
 * instead of letting it snap: `capture()` reads the box right before the
 * move is applied, and the layout effect after the move animates the box's
 * width and height from that size to the new pearl's, then clears them so
 * the box follows its content again. Width and height are animated on
 * purpose (a transform would stretch the sliding media); the subtree is
 * one image or player and three buttons. Nothing under reduced motion.
 */
export function useBoxResize(
  boxRef: RefObject<HTMLElement | null>,
  currentId: string | null,
  reducedMotion: boolean,
) {
  const from = useRef<{ width: number; height: number } | null>(null);
  const running = useRef<AnimationPlaybackControls | null>(null);

  /** Stops a running resize and lets the box follow its content. */
  const cancel = useCallback(() => {
    running.current?.stop();
    running.current = null;
    from.current = null;
    const el = boxRef.current;
    if (el) {
      el.style.width = "";
      el.style.height = "";
    }
  }, [boxRef]);

  /** Reads the box as it is now (mid-resize included), right before a move. */
  const capture = useCallback(() => {
    const el = boxRef.current;
    if (!el || reducedMotion) return;
    // Mid-morph (the open's layout animation scales the box), its rect
    // isn't its size: the box snaps, as it did before.
    const transform = getComputedStyle(el).transform;
    if (transform !== "none" && transform !== "matrix(1, 0, 0, 1, 0, 0)") return;
    const rect = el.getBoundingClientRect();
    from.current = { width: rect.width, height: rect.height };
    // The box must follow its content for the new size to be measured.
    running.current?.stop();
    running.current = null;
    el.style.width = "";
    el.style.height = "";
  }, [boxRef, reducedMotion]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    const start = from.current;
    from.current = null;
    if (!el || !start || currentId === null) return;
    const rect = el.getBoundingClientRect();
    const to = { width: rect.width, height: rect.height };
    if (Math.abs(to.width - start.width) < 1 && Math.abs(to.height - start.height) < 1) return;
    // A plain 0 → 1 tween writing the size itself: `animate(el, …)` would
    // keep width and height as motion values on the Popup (a Motion
    // element), and Motion would write them back on its next render, the
    // close morph included.
    const size = (progress: number) => {
      el.style.width = `${start.width + (to.width - start.width) * progress}px`;
      el.style.height = `${start.height + (to.height - start.height) * progress}px`;
    };
    size(0);
    const controls = animate(0, 1, { ...RESIZE_TRANSITION, onUpdate: size });
    running.current = controls;
    controls.then(() => {
      // Only the resize that finished clears the size; a newer one owns it.
      if (running.current !== controls) return;
      running.current = null;
      el.style.width = "";
      el.style.height = "";
    });
  }, [boxRef, currentId]);

  useLayoutEffect(() => cancel, [cancel]);

  return { capture, cancel };
}
