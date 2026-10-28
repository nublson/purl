"use client";

/* Adapted from Bencho's "Now playing" (bencho.dev), MIT licence: the drawn
   play/pause mark, its tween and its goo. */

import { useEffect, useRef, useState } from "react";
import { clamp, markPaths, SWING } from "@/lib/play-mark-path";

/* ── eased, NOT sprung ─────────────────────────────────────
   A spring past its target takes every value derived from it
   along, and the mark's corners would wobble rather than
   bounce. So: a curve that never passes the number it is
   going to.

   It reads its start from wherever it currently IS, so
   pressing again mid-flight turns the object around rather
   than snapping it to an end it never reached. */
function useTween(to: number, ms: number, instant: boolean) {
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
      const t = Math.min(1, (now - t0) / ms);
      cur.current = from + (to - from) * SWING(t);
      setAt(cur.current);
      raf.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [to, ms, instant]);

  /* Instant is read at render, not tweened. Both the drawn value and the
     tween's start track the target meanwhile, so if the preference flips
     back the next tween starts from the shape on screen. */
  return instant ? to : at;
}

/* The mark shows what pressing does not: while playing it is the pause. */
export function PlayMark({
  playing,
  size,
  reducedMotion,
}: {
  playing: boolean;
  size: number;
  reducedMotion: boolean;
}) {
  /* 0 is the pause, 1 is the play. Eased both ends, unlike
     the box's own move: this one leaves a shape as well as
     arriving at one, and a curve that only softens the
     landing snaps out of the shape it was. */
  const t = useTween(playing ? 0 : 1, 300, reducedMotion);
  const { left, right } = markPaths(t);

  /* ── the goo ─────────────────────────────────────────────
     Zero at both ends and one in the middle, so everything
     below is a bulge on the way rather than a difference
     between the two states — press twice and it lands on
     exactly what it started as.

     Three things ride it, and they are all the same idea:
     the mark squashes across as it stretches up, the two
     halves lean into each other until they touch, and the
     whole thing tips a few degrees and comes back level. A
     shape that changes size without ever changing volume is
     what makes something read as soft rather than as
     redrawn. The tilt swaps sign with the direction, so
     pausing is not just playing run backwards. */
  const goo = Math.sin(clamp(t, 0, 1) * Math.PI);
  const pull = 1.6 * goo;
  const tip = (playing ? -9 : 9) * goo;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
      /* per cent, not pixels: this is the element's own box
         and the box is whatever size the morph is at. */
      style={{
        transformOrigin: "50% 50%",
        transform: `rotate(${tip}deg) scale(${1 - 0.13 * goo}, ${1 + 0.11 * goo})`,
      }}
    >
      <path d={left} transform={`translate(${pull} 0)`} />
      <path d={right} transform={`translate(${-pull} 0)`} />
    </svg>
  );
}
