/**
 * What a drag on the media viewer's media does once it's let go: across
 * moves to the previous or next pearl, up or down closes. Pure, so the
 * thresholds test without a pointer.
 */
export type DragOutcome = "prev" | "next" | "close" | "none";

type Vector = { x: number; y: number };

/** How far a drag must go (px), or how fast it must be let go (px/s). */
export const SWIPE_DISTANCE = 80;
export const SWIPE_VELOCITY = 400;

/**
 * `lock` is the axis Motion locked the drag to (`dragDirectionLock`), null
 * when it never moved far enough to pick one. Across, the sign decides: a
 * drag to the left shows the next pearl, to the right the previous one,
 * unless it was flicked back the other way. Up or down closes either way.
 */
export function decideDrag(offset: Vector, velocity: Vector, lock: "x" | "y" | null): DragOutcome {
  if (lock === null) return "none";
  const distance = offset[lock];
  const speed = velocity[lock];
  const passed = Math.abs(distance) >= SWIPE_DISTANCE || Math.abs(speed) >= SWIPE_VELOCITY;
  if (!passed) return "none";
  if (lock === "y") return "close";
  const way = Math.sign(distance) || Math.sign(speed);
  // Flicked back against the drag: the reader changed their mind.
  if (speed * way <= -SWIPE_VELOCITY) return "none";
  return way < 0 ? "next" : "prev";
}
