/**
 * FLIP for one list change: record where every `[data-flip]` element is
 * (`captureFlip`), let the change render, then (`playFlip`, in a layout
 * effect, before paint) start each element where it was and glide it to
 * where it is now. An element whose key moved to a new element (a link
 * leaving the search's Add section for the folder's results) glides from
 * the old one's spot; a key that's new fades in. Transforms and opacity
 * only (Web Animations, nothing left behind), so layout is never touched.
 * Reduced motion: nothing moves.
 */

/** Long enough to follow a row across the page, short enough not to wait on. */
export const FLIP_DURATION_MS = 300;
/** Ease-out with a soft landing (the app's `ease-out-strong` family). */
const FLIP_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";

export type FlipSnapshot = Map<string, DOMRect>;

function flipElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-flip]"));
}

export function captureFlip(): FlipSnapshot {
  const snapshot: FlipSnapshot = new Map();
  for (const element of flipElements()) {
    const key = element.dataset.flip;
    if (key && !snapshot.has(key)) {
      snapshot.set(key, element.getBoundingClientRect());
    }
  }
  return snapshot;
}

export function playFlip(before: FlipSnapshot): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const element of flipElements()) {
    const key = element.dataset.flip;
    if (!key || typeof element.animate !== "function") continue;
    const from = before.get(key);
    const to = element.getBoundingClientRect();
    if (!from) {
      // New here (a day heading the added link opened): fade in as the
      // rest settles.
      element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FLIP_DURATION_MS,
        easing: FLIP_EASING,
      });
      continue;
    }
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    element.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: "translate(0, 0)" },
      ],
      { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
    );
  }
}
