"use client";

import { useInView } from "motion/react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Most cards that may play (video previews, embeds) at once on a page. */
export const MAX_LIVE_CARDS = 6;

type Token = object;

// Cards holding a slot, and cards in view that are waiting for one (in order).
const live = new Set<Token>();
const waiting = new Set<Token>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

function claim(token: Token) {
  if (live.has(token)) return;
  if (live.size < MAX_LIVE_CARDS) {
    waiting.delete(token);
    live.add(token);
  } else {
    waiting.add(token);
  }
  emit();
}

function release(token: Token) {
  const hadSlot = live.delete(token);
  const wasWaiting = waiting.delete(token);
  if (hadSlot) {
    for (const next of waiting) {
      if (live.size >= MAX_LIVE_CARDS) break;
      waiting.delete(next);
      live.add(next);
    }
  }
  if (hadSlot || wasWaiting) emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether this card may play: it is wanted, within 200px of the viewport, and
 * among the first `MAX_LIVE_CARDS` cards to claim a slot. A slot freed by a
 * card leaving view (or unmounting) goes to the next one waiting. Callers
 * pass `wanted` false while their pearl is open in the media viewer
 * (`useIsMediaOpen`), which plays it instead, so the card's loop pauses.
 */
export function useLiveCards(
  ref: React.RefObject<Element | null>,
  wanted: boolean,
): boolean {
  const inView = useInView(ref, { margin: "200px" });
  const [token] = useState<Token>(() => ({}));

  useEffect(() => {
    if (!inView || !wanted) return;
    claim(token);
    return () => release(token);
  }, [inView, wanted, token]);

  const getSnapshot = useCallback(() => live.has(token), [token]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
