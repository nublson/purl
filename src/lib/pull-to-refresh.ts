/**
 * Numbers and pure rules behind pull-to-refresh on the link list (see
 * `usePullToRefresh`). Distances are in CSS pixels of list movement.
 */

/** Release past this far and the list refreshes; earlier, it springs back. */
export const PULL_THRESHOLD = 64;

/** The list never moves further than this, however far the finger goes. */
export const PULL_MAX = 112;

/** Where the list rests while refreshing: room for the spinner above it. */
export const PULL_REFRESHING_OFFSET = 48;

/** The spinner stays at least this long, so a fast refresh doesn't blink. */
export const PULL_MIN_REFRESH_MS = 400;

/** Finger travel before deciding whether a touch is a pull or a scroll/swipe. */
export const PULL_SLOP = 8;

/** Coming back to the app after at least this long away refreshes the list. */
export const RETURN_REFRESH_AFTER_MS = 30_000;

/**
 * How far the list moves for `fingerDelta` pixels of downward finger travel:
 * half the travel (the list feels heavier than the finger), capped at
 * `PULL_MAX`. Upward travel doesn't move it.
 */
export function pullDistance(fingerDelta: number): number {
  if (fingerDelta <= 0) return 0;
  return Math.min(PULL_MAX, fingerDelta / 2);
}

/**
 * Once the finger has moved past `PULL_SLOP`: `"pull"` when the drag is
 * mainly downward, `"ignore"` for upward or sideways drags (normal scrolling,
 * horizontal swipes), `"undecided"` until then.
 */
export function classifyDrag(
  dx: number,
  dy: number,
): "pull" | "ignore" | "undecided" {
  if (Math.hypot(dx, dy) < PULL_SLOP) return "undecided";
  return dy > 0 && Math.abs(dy) > Math.abs(dx) ? "pull" : "ignore";
}
