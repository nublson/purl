"use client";

import { useCallback, useSyncExternalStore } from "react";

let currentId: string | null = null;
const listeners = new Set<() => void>();

/**
 * The id of the audio pearl that is playing, or null. One store for the whole
 * page, so starting one card stops the other.
 */
export const audioPlayerStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): string | null {
    return currentId;
  },
  /** Plays `id`, or stops it when it is already the one playing. */
  toggle(id: string): void {
    currentId = currentId === id ? null : id;
    for (const listener of [...listeners]) listener();
  },
  /**
   * Stops `id` if it is the one playing (its element ended, or its card
   * unmounted), so a remounted card never starts on its own.
   */
  stop(id: string): void {
    if (currentId !== id) return;
    currentId = null;
    for (const listener of [...listeners]) listener();
  },
};

/**
 * Whether this card's audio is playing. The hook owns no `<audio>` element:
 * the card face wires its element to `playing`.
 */
export function useAudioPlayer(id: string): {
  playing: boolean;
  toggle: () => void;
} {
  const current = useSyncExternalStore(
    audioPlayerStore.subscribe,
    audioPlayerStore.getSnapshot,
    () => null,
  );
  const toggle = useCallback(() => audioPlayerStore.toggle(id), [id]);
  return { playing: current === id, toggle };
}
