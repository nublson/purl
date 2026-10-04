"use client";

import { useSyncExternalStore } from "react";

/**
 * Swipe actions on a link row (phones): right toggles read when released
 * past `SWIPE_READ_AT`; left reveals Delete and Move and rests open at
 * `SWIPE_OPEN_X`. Positions, not velocity, decide where a row lands, so it
 * always settles on one of its stops (0, open) instead of being flung.
 */

/** Finger travel before a gesture picks an axis (horizontal swipe or scroll). */
export const SWIPE_LOCK_DISTANCE = 10;
/** Released this far right (px), the row toggles read. */
export const SWIPE_READ_AT = 72;
/** Past this, a right swipe moves at `SWIPE_RIGHT_RESISTANCE` of the finger. */
const SWIPE_RIGHT_MAX = 120;
const SWIPE_RIGHT_RESISTANCE = 0.2;
/** Where a row rests open: room for the two 40px buttons and their gaps. */
export const SWIPE_OPEN_X = -100;
/** Past the open stop, a left swipe barely moves (a hint of an edge). */
const SWIPE_LEFT_RESISTANCE = 0.05;
/** Swiped left this far (px), the first (outer) button shows, then the second. */
export const SWIPE_REVEAL_FIRST = 44;
export const SWIPE_REVEAL_SECOND = 88;

/**
 * The axis a gesture locks to once it has moved `SWIPE_LOCK_DISTANCE`, or
 * null while it hasn't. Mostly sideways is a swipe; anything else scrolls.
 */
export function swipeAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.hypot(dx, dy) < SWIPE_LOCK_DISTANCE) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/**
 * Where the row sits for a raw offset `raw` (start position plus finger
 * travel). A row that started open only goes back toward closed: no read
 * swipe from there.
 */
export function swipeOffset(raw: number, { fromOpen }: { fromOpen: boolean }) {
  if (raw < SWIPE_OPEN_X) {
    return SWIPE_OPEN_X + (raw - SWIPE_OPEN_X) * SWIPE_LEFT_RESISTANCE;
  }
  if (fromOpen) return Math.min(raw, 0);
  if (raw > SWIPE_RIGHT_MAX) {
    return SWIPE_RIGHT_MAX + (raw - SWIPE_RIGHT_MAX) * SWIPE_RIGHT_RESISTANCE;
  }
  return raw;
}

/** What letting go at `x` does: toggle read, rest open, or close. */
export function swipeRelease(x: number): "read" | "open" | "close" {
  if (x >= SWIPE_READ_AT) return "read";
  if (x <= SWIPE_OPEN_X / 2) return "open";
  return "close";
}

/** How many of the left swipe's buttons show at `x` (0, 1 or 2). */
export function swipeRevealed(x: number): 0 | 1 | 2 {
  if (x <= -SWIPE_REVEAL_SECOND) return 2;
  if (x <= -SWIPE_REVEAL_FIRST) return 1;
  return 0;
}

// One row open at a time: opening (or starting to swipe) another closes it.
let openId: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marks `id` as the open (or swiping) row, or none with null. */
export function setOpenSwipeRow(id: string | null) {
  if (openId === id) return;
  openId = id;
  for (const listener of listeners) listener();
}

/** Closes `id` if it's the open row (leaves another open row alone). */
export function closeSwipeRow(id: string) {
  if (openId === id) setOpenSwipeRow(null);
}

/** The open (or swiping) row's id. */
export function useOpenSwipeRow(): string | null {
  return useSyncExternalStore(subscribe, () => openId, () => null);
}
