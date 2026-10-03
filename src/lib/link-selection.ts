"use client";

import { useSyncExternalStore } from "react";

/**
 * Which links are selected for a bulk action (move to folder, delete), in the
 * list on screen (Home or one folder). Selection mode is simply "something
 * is selected".
 *
 * `HomeShell` registers the list's links, in display order, with
 * `setSelectableLinks` whenever it changes; that order drives shift-click
 * ranges and Select all, and links that leave the list (moved out of this
 * folder, deleted) drop out of the selection.
 */
export type LinkSelectionState = {
  selected: ReadonlySet<string>;
  /** The last link clicked without Shift; a Shift-click selects from here. */
  anchor: string | null;
};

const EMPTY_SET: ReadonlySet<string> = new Set();
export const EMPTY_SELECTION: LinkSelectionState = {
  selected: EMPTY_SET,
  anchor: null,
};

/** Selects `id`, or unselects it when it's selected; it becomes the anchor. */
export function toggleInSelection(
  state: LinkSelectionState,
  id: string,
): LinkSelectionState {
  const selected = new Set(state.selected);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return { selected, anchor: id };
}

/**
 * Shift-click on `id`: every link between the anchor and `id` (inclusive, in
 * `order`) takes the state `id` is switching to, so a range can be selected
 * or unselected. Without an anchor in `order`, it's a plain toggle. The
 * anchor stays put, so another Shift-click re-ranges from the same link.
 */
export function extendSelection(
  state: LinkSelectionState,
  id: string,
  order: readonly string[],
): LinkSelectionState {
  const from = state.anchor === null ? -1 : order.indexOf(state.anchor);
  const to = order.indexOf(id);
  if (from === -1 || to === -1) return toggleInSelection(state, id);
  const select = !state.selected.has(id);
  const selected = new Set(state.selected);
  for (const linkId of order.slice(Math.min(from, to), Math.max(from, to) + 1)) {
    if (select) selected.add(linkId);
    else selected.delete(linkId);
  }
  return { selected, anchor: state.anchor };
}

/** Drops selected links (and the anchor) that are no longer in `order`. */
export function retainInSelection(
  state: LinkSelectionState,
  order: readonly string[],
): LinkSelectionState {
  const present = new Set(order);
  const kept = Array.from(state.selected).filter((id) => present.has(id));
  const anchor =
    state.anchor !== null && present.has(state.anchor) ? state.anchor : null;
  if (kept.length === state.selected.size && anchor === state.anchor) {
    return state;
  }
  return { selected: kept.length ? new Set(kept) : EMPTY_SET, anchor };
}

let state: LinkSelectionState = EMPTY_SELECTION;
let order: readonly string[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function setState(next: LinkSelectionState) {
  if (next === state) return;
  state = next;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The selected link ids (an empty set when nothing is selected). */
export function useSelectedLinkIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => state.selected,
    () => EMPTY_SET,
  );
}

/** Whether any link is selected (selection mode); re-renders only when that flips. */
export function useIsSelectionActive(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.selected.size > 0,
    () => false,
  );
}

/** How many links the list offers for selection (what Select all selects). */
export function useSelectableLinkCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => order.length,
    () => 0,
  );
}

/** Whether `id` is selected; re-renders a row only when its own state flips. */
export function useIsLinkSelected(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.selected.has(id),
    () => false,
  );
}

/** Selection actions; safe to call from event handlers anywhere. */
export const linkSelection = {
  /** Click or checkbox on a row (pass `shiftKey` to select a range). */
  toggle(id: string, opts?: { shiftKey?: boolean }) {
    setState(
      opts?.shiftKey
        ? extendSelection(state, id, order)
        : toggleInSelection(state, id),
    );
  },
  /** Selects every link in the list (every loaded link). */
  selectAll() {
    setState({ selected: new Set(order), anchor: state.anchor });
  },
  /** Leaves selection mode. */
  clear() {
    setState(EMPTY_SELECTION);
  },
  /** Current selected ids, in display order (for the bulk actions). */
  selectedIds(): string[] {
    return order.filter((id) => state.selected.has(id));
  },
};

/**
 * Registers the list's link ids in display order (called by `HomeShell`).
 * Links no longer in it leave the selection.
 */
export function setSelectableLinks(ids: readonly string[]) {
  const lengthChanged = ids.length !== order.length;
  order = ids;
  const next = retainInSelection(state, ids);
  if (next !== state) setState(next);
  else if (lengthChanged) notify();
}
