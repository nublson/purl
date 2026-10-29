"use client";

import { useSyncExternalStore } from "react";

/**
 * The live card the pointer is given to (clicked "Interact with …"), at most
 * one at a time: making another card active leaves the first. A store
 * outside React, like `linkSelection`, so every card reads it.
 */
function createActiveEmbedStore() {
  let current: string | null = null;
  const listeners = new Set<() => void>();

  const set = (id: string | null) => {
    if (id === current) return;
    current = id;
    for (const listener of [...listeners]) listener();
  };

  return {
    get: (): string | null => current,
    set,
    /** Leaves `id` if it's the active card (a card leaving only itself). */
    clearIf: (id: string) => {
      if (current === id) set(null);
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const activeEmbed = createActiveEmbedStore();

/** Whether `id`'s live card is the active one (re-renders only when that flips). */
export function useIsActiveEmbed(id: string): boolean {
  return useSyncExternalStore(
    activeEmbed.subscribe,
    () => activeEmbed.get() === id,
    () => false,
  );
}
