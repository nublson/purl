"use client";

import { useSyncExternalStore } from "react";

/**
 * Open state of the folder page's "Add links" dialog, so the header's add
 * menu, the folder's empty state and the `A` shortcut can all open the one
 * dialog the folder page renders.
 */
let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === open) return;
  open = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const addLinksDialog = {
  open: () => set(true),
  close: () => set(false),
  setOpen: set,
};

export function useAddLinksDialogOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
