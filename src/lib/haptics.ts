/**
 * What a haptic marks: a choice changing (a toggle, a selection), an action
 * done (moved, marked, copied), or one that removes something (delete).
 */
export type HapticKind = "selection" | "success" | "warning";

/**
 * Android's vibration patterns (ms on, off, on): a single short tick for a
 * selection, two light ones for a success, two firmer ones for a warning.
 * iOS has one switch tick for all of them (see `HapticTarget`).
 */
export const HAPTIC_PATTERNS: Record<HapticKind, number[]> = {
  selection: [10],
  success: [10, 60, 10],
  warning: [25, 60, 25],
};

/**
 * A haptic on Android (Chrome, Firefox), from the tap's own handler. Call it
 * where a tap acts, not in functions keyboard shortcuts share.
 *
 * Only on touch screens: desktop Chrome has `navigator.vibrate` too (it does
 * nothing there). iOS has no `vibrate`, so it's a no-op there: iOS gets its
 * tick from `HapticTarget`. Never throws (a browser may refuse to vibrate,
 * e.g. before the page's first user gesture).
 */
export function haptic(kind: HapticKind): void {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      return;
    }
    if (typeof matchMedia !== "function" || !matchMedia("(pointer: coarse)").matches) {
      return;
    }
    navigator.vibrate(HAPTIC_PATTERNS[kind]);
  } catch {
    // Vibration is a nicety: never let it break the action it decorates.
  }
}

/**
 * Runs a tap's action in the next task. iOS's tick (`HapticTarget`) plays
 * only if the tapped control is still on the page once the tap's events are
 * done, and React applies a tap's updates right away: an action that removes
 * its own control (Delete ending the selection hides the selection bar)
 * would cancel the tick. A task later is imperceptible. It runs even if the
 * control has unmounted by then: that's the point (Delete must still delete).
 */
export function afterTap(action: () => void): void {
  setTimeout(action, 0);
}
