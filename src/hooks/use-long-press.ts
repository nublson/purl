"use client";

import * as React from "react";

/** Holding this long on a touch screen counts as a long-press. */
export const LONG_PRESS_MS = 500;
/** Finger travel that turns a long-press into a scroll. */
export const LONG_PRESS_SLOP = 10;

/**
 * A touch long-press (`onLongPress` after `LONG_PRESS_MS` without moving
 * `LONG_PRESS_SLOP`). Spread `handlers` on the element; call
 * `consumeLongPress()` in the click that follows: true means the press
 * already acted, so swallow the click. `cancel` stops a pending press
 * (e.g. when a gesture takes the finger).
 */
export function useLongPress(onLongPress: () => void) {
  const pressRef = React.useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
  } | null>(null);
  const firedRef = React.useRef(false);
  const onLongPressRef = React.useRef(onLongPress);
  React.useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  const cancel = React.useCallback(() => {
    if (pressRef.current) clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  }, []);
  React.useEffect(() => cancel, [cancel]);

  const handlers = {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType !== "touch") return;
      cancel();
      firedRef.current = false;
      pressRef.current = {
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          pressRef.current = null;
          firedRef.current = true;
          onLongPressRef.current();
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove: (event: React.PointerEvent) => {
      const press = pressRef.current;
      if (
        press &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) >
          LONG_PRESS_SLOP
      ) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      // The long-press acted; no browser menu on top of it.
      if (firedRef.current) event.preventDefault();
    },
  };

  const consumeLongPress = React.useCallback(() => {
    const fired = firedRef.current;
    firedRef.current = false;
    return fired;
  }, []);

  return { handlers, consumeLongPress, cancel };
}
