"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Which audio pearl's bar is open (expanded in place into its player): one
 * at a time, so opening one closes another. Opening never changes playback
 * (`audioPlayerStore`), and playback never changes this.
 */
export interface AudioExpansionStore {
  /** The open pearl, else null. */
  readonly openId: string | null;
  subscribe(listener: () => void): () => void;
  getSnapshot(): string | null;
  /** Opens pearl `id` (closing any other), or closes it when it's open. */
  toggle(id: string): void;
  /** Closes the open pearl; with `id`, only if it's that one. */
  close(id?: string): void;
}

export function createAudioExpansion(): AudioExpansionStore {
  let openId: string | null = null;
  const listeners = new Set<() => void>();

  function set(next: string | null) {
    if (next === openId) return;
    openId = next;
    for (const listener of [...listeners]) listener();
  }

  return {
    get openId() {
      return openId;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => openId,
    toggle(id) {
      set(openId === id ? null : id);
    },
    close(id) {
      if (id === undefined || openId === id) set(null);
    },
  };
}

/** The page's one: every audio bar reads it. */
export const audioExpansion = createAudioExpansion();

/** Whether pearl `id`'s bar is open, and its actions. */
export function useAudioExpanded(id: string): {
  open: boolean;
  toggle: () => void;
  close: () => void;
} {
  const open = useSyncExternalStore(
    audioExpansion.subscribe,
    () => audioExpansion.getSnapshot() === id,
    () => false,
  );
  const toggle = useCallback(() => audioExpansion.toggle(id), [id]);
  const close = useCallback(() => audioExpansion.close(id), [id]);
  return { open, toggle, close };
}
