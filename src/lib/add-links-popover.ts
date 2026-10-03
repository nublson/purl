"use client";

import { useSyncExternalStore } from "react";

/** Where the "Add links" popover opens: under the header's + button, or on the empty state's button. */
export type AddLinksAnchor = "header" | "empty";

/** The `A` shortcut that opens it (folder pages). */
export const ADD_LINKS_SHORTCUT = "A";

/**
 * Which "Add links" popover is open, if any. The header's + menu, the `A`
 * shortcut and the folder's empty state all open it through this.
 */
let openAnchor: AddLinksAnchor | null = null;
const listeners = new Set<() => void>();

function set(next: AddLinksAnchor | null) {
  if (next === openAnchor) return;
  openAnchor = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const addLinksPopover = {
  open: (anchor: AddLinksAnchor) => set(anchor),
  close: () => set(null),
  /** The anchor it's open on, or null. */
  current: (): AddLinksAnchor | null => openAnchor,
};

export function useAddLinksPopoverAnchor(): AddLinksAnchor | null {
  return useSyncExternalStore(subscribe, () => openAnchor, () => null);
}
