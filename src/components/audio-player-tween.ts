"use client";

/* Adapted from Bencho's "Now playing" (bencho.dev), MIT licence: the tween
   that drives the drawn play/pause mark. */

import { useEffect, useRef, useState } from "react";
import { clamp, SWING } from "@/lib/play-mark-path";

export { clamp, SWING };

/**
 * A number eased towards `to` over `ms`, one value per animation frame.
 * It reads its start from wherever it currently IS, so pressing again
 * mid-flight turns the object around rather than snapping it to an end it
 * never reached. `instant` (reduced motion) jumps. Pass `ease` as a stable
 * function (a module constant, like `SWING`).
 */
export function useTween(
  to: number,
  ms: number,
  instant: boolean,
  ease: (t: number) => number,
) {
  const [at, setAt] = useState(to);
  const cur = useRef(to);
  const raf = useRef(0);
  /* Instant: the drawn value follows the target as it changes (React's
     adjust-state-during-render), so nothing is set from an effect. */
  if (instant && at !== to) setAt(to);

  useEffect(() => {
    if (instant) {
      cur.current = to;
      return;
    }
    const from = cur.current;
    if (from === to) return;
    const t0 = performance.now();
    const step = (now: number) => {
      /* Clamped at 0 too: a frame's timestamp is when the frame
         began, which can be before `t0` was read. */
      const t = clamp((now - t0) / ms, 0, 1);
      cur.current = from + (to - from) * ease(t);
      setAt(cur.current);
      raf.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [to, ms, instant, ease]);

  /* Instant is read at render, not tweened. Both the drawn value and the
     tween's start track the target meanwhile, so if the preference flips
     back the next tween starts from the shape on screen. */
  return instant ? to : at;
}
