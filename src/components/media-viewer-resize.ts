"use client";

import { VIEWER_MOVE } from "@/lib/motion";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";


/** How long the box waits for a pearl's media to take a size before it snaps. */
const UNSIZED_WAIT_MS = 1000;

type Size = { width: number; height: number };

/**
 * Resizes the viewer's box from the pearl it showed to the one it moves to,
 * instead of letting it snap: `capture()` reads the box right before the
 * move is applied, and the layout effect after the move animates the box's
 * width and height from that size to the new pearl's, then clears them so
 * the box follows its content again. Width and height are animated on
 * purpose (a transform would stretch the sliding media); the subtree is
 * one image or player and three buttons. A pearl whose media has no size
 * yet (an image without a stored size, before its preview arrives) keeps
 * the box at the old size until it has one, then resizes to it (or snaps
 * after `UNSIZED_WAIT_MS`). Nothing under reduced motion.
 */
export function useBoxResize(
  boxRef: RefObject<HTMLElement | null>,
  currentId: string | null,
  reducedMotion: boolean,
) {
  const from = useRef<Size | null>(null);
  const running = useRef<AnimationPlaybackControls | null>(null);
  const waiting = useRef<ResizeObserver | null>(null);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Stops a running resize, or the wait for an unsized pearl's media. */
  const stop = useCallback(() => {
    running.current?.stop();
    running.current = null;
    waiting.current?.disconnect();
    waiting.current = null;
    clearTimeout(waitTimer.current);
  }, []);

  /** Stops a running resize and lets the box follow its content. */
  const cancel = useCallback(() => {
    stop();
    from.current = null;
    const el = boxRef.current;
    if (el) {
      el.style.width = "";
      el.style.height = "";
    }
  }, [boxRef, stop]);

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
    stop();
    el.style.width = "";
    el.style.height = "";
  }, [boxRef, reducedMotion, stop]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    const start = from.current;
    from.current = null;
    if (!el || !start || currentId === null) return;
    const measure = (): Size => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };
    const pin = (size: Size) => {
      el.style.width = `${size.width}px`;
      el.style.height = `${size.height}px`;
    };
    const unpin = () => {
      el.style.width = "";
      el.style.height = "";
    };
    const resize = (to: Size) => {
      if (Math.abs(to.width - start.width) < 1 && Math.abs(to.height - start.height) < 1) return;
      // A plain 0 → 1 tween writing the size itself: `animate(el, …)` would
      // keep width and height as motion values on the Popup (a Motion
      // element), and Motion would write them back on its next render, the
      // close morph included.
      const size = (progress: number) =>
        pin({
          width: start.width + (to.width - start.width) * progress,
          height: start.height + (to.height - start.height) * progress,
        });
      size(0);
      const controls = animate(0, 1, { ...VIEWER_MOVE, onUpdate: size });
      running.current = controls;
      controls.then(() => {
        // Only the resize that finished clears the size; a newer one owns it.
        if (running.current !== controls) return;
        running.current = null;
        unpin();
      });
    };

    const to = measure();
    if (to.width >= 1 && to.height >= 1) {
      resize(to);
      return;
    }
    // The new pearl's media has no size yet: hold the box at the old size
    // and watch the media's wrapper (the child holding the slides) until it
    // takes one. The wrapper is a flex item of the held box, so its size is
    // capped by it: the target is the box's own size, read with the hold
    // lifted for that one measurement (no frame is drawn in between).
    pin(start);
    const content =
      Array.from(el.children).find((child) => child.querySelector("[data-viewer-media]")) ?? el;
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (!box || box.width < 1 || box.height < 1) return;
      stop();
      unpin();
      const size = measure();
      if (size.width < 1 || size.height < 1) return;
      resize(size);
    });
    waiting.current = observer;
    observer.observe(content);
    waitTimer.current = setTimeout(() => {
      if (waiting.current !== observer) return;
      stop();
      unpin();
    }, UNSIZED_WAIT_MS);
  }, [boxRef, currentId, stop]);

  useLayoutEffect(() => cancel, [cancel]);

  return { capture, cancel };
}
