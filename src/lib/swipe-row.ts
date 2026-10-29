/** Width of the action a swiped row reveals (Edit or Delete), in px. */
export const SWIPE_REVEAL = 72;

/** Past this share of the row's width, a release acts at once. */
export const SWIPE_FULL_RATIO = 0.6;

/** A flick this fast (px/ms) opens or shuts the row from anywhere. */
export const SWIPE_FLICK_VELOCITY = 0.5;

export type SwipeOutcome = "closed" | "open" | "full";

/**
 * Where a swiped row settles when the finger lifts, measured toward the
 * action it uncovers (either side): `distance` is how far it's moved that
 * way (≥ 0), `velocity` its speed that way (px/ms; negative is back). Far
 * enough is the action itself, past half the reveal (or a flick toward the
 * action) stays open on its button, anything else springs shut, and a
 * flick back always shuts it.
 */
export function decideSwipe({
  distance,
  velocity,
  width,
}: {
  distance: number;
  velocity: number;
  width: number;
}): SwipeOutcome {
  if (velocity <= -SWIPE_FLICK_VELOCITY) return "closed";
  if (distance >= width * SWIPE_FULL_RATIO) return "full";
  if (distance >= SWIPE_REVEAL / 2 || velocity >= SWIPE_FLICK_VELOCITY) {
    return "open";
  }
  return "closed";
}
