"use client";

import { useSyncExternalStore } from "react";

/**
 * Which links are selected for a bulk action (move to folder, delete), in the
 * list on screen (Home or one folder). Selection mode is simply "something
 * is selected".
 *
 * `HomeShell` registers the links on screen, in display order, with
 * `setSelectableLinks` whenever they change; that order drives shift-click
 * ranges and Select all. A search narrows what's on screen without touching
 * the selection: selected links it hides stay selected (and in the bulk
 * actions), so you can search, select, and search again. Links that leave
 * for good (deleted, moved out of this folder) are removed by `HomeShell`.
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

/** Whether every link on screen is selected (Select all's checked state). */
export function useAreAllShownSelected(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => order.length > 0 && order.every((id) => state.selected.has(id)),
    () => false,
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
  /** Adds every link on screen (every loaded result) to the selection. */
  selectAll() {
    setState({
      selected: new Set([...state.selected, ...order]),
      anchor: state.anchor,
    });
  },
  /** Unselects the links on screen, keeping ones a search hides. */
  unselectShown() {
    linkSelection.remove(order);
  },
  /** Unselects `ids` (e.g. the links an action just moved), keeping the rest. */
  remove(ids: readonly string[]) {
    const gone = new Set(ids);
    const kept = Array.from(state.selected).filter((id) => !gone.has(id));
    if (kept.length === state.selected.size) return;
    setState({
      selected: kept.length ? new Set(kept) : EMPTY_SET,
      anchor: state.anchor !== null && gone.has(state.anchor) ? null : state.anchor,
    });
  },
  /**
   * Keeps only the selected links in `ids`: after the data changed (here or
   * elsewhere), selected links a search hides may have been deleted or
   * moved out, and only a fresh list can vouch for them.
   */
  retain(ids: readonly string[]) {
    setState(retainInSelection(state, ids));
  },
  /** Leaves selection mode. */
  clear() {
    setState(EMPTY_SELECTION);
  },
  /**
   * Current selected ids (for the bulk actions): the ones on screen in
   * display order, then the ones a search hides, in the order picked.
   */
  selectedIds(): string[] {
    const shown = order.filter((id) => state.selected.has(id));
    const onScreen = new Set(order);
    const hidden = Array.from(state.selected).filter((id) => !onScreen.has(id));
    return [...shown, ...hidden];
  },
};

/**
 * Registers the link ids on screen in display order (called by `HomeShell`).
 * With `complete` (no search, every page loaded: the list is all there is),
 * links no longer in it leave the selection; otherwise a link missing from
 * it may just be filtered out or not loaded, so the selection is kept.
 */
export function setSelectableLinks(
  ids: readonly string[],
  { complete }: { complete: boolean },
) {
  const changed =
    ids.length !== order.length || ids.some((id, index) => id !== order[index]);
  order = ids;
  const next = complete ? retainInSelection(state, ids) : state;
  if (next !== state) setState(next);
  else if (changed) notify();
}
