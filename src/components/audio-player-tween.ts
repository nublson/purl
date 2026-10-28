"use client";

/* Adapted from Bencho's "Now playing" (bencho.dev), MIT licence: the tween
   that drives the drawn mark and the bar's expansion, and its eases. */

import { useEffect, useRef, useState } from "react";
import { clamp, mix, SWING } from "@/lib/play-mark-path";

export { clamp, mix, SWING };

/* ── eased, NOT sprung ─────────────────────────────────────
   A spring past its target takes every value derived from it
   along — the height, and the radius with it, dipping under
   its end value and coming back. That is a wobble, not a
   bounce.

   So: a curve that is quick off the mark and lands without
   ever passing the number it is going to. Quart-out is
   cubic-bezier(0.22, 1, 0.36, 1) in all but name. */
export const QUART = (t: number) => 1 - (1 - t) ** 4;
/* the swell's clock — see the note where it is used */
export const FLAT = (t: number) => t;

/**
 * A number eased towards `to` over `ms`, one value per animation frame.
 * It reads its start from wherever it currently IS, so pressing again
 * mid-flight turns the object around rather than snapping it to an end it
 * never reached. `instant` (reduced motion) jumps. Pass `ease` as a stable
 * function (these module constants).
 */
export function useTween(to: number, ms: number, instant = false, ease = QUART) {
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
         began, which can be before `t0` was read, and quart-out
         below 0 runs backwards (the bar dipped under 78). */
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
