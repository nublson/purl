"use client";

import { useMemo, useSyncExternalStore } from "react";
import { isMediaKind, linkKind } from "@/lib/link-kind";
import type { Link } from "@/utils/links";

/**
 * The media viewer's state, outside React so the cards, rows, the dialog and
 * the URL sync all talk to one place (like `linkSelection`).
 *
 * `items` are the image, video and audio pearls on screen, in display order,
 * registered by the page whenever its list changes. `openedId` is the pearl
 * the viewer opened from (the card the dialog morphs out of and back into),
 * `currentId` the one showing now; they differ after next/prev.
 */
export type MediaViewerPreset = "smooth" | "snappy";

export type MediaViewerState = {
  items: Link[];
  openedId: string | null;
  currentId: string | null;
  /** The morph's spring: smooth for cards, snappy for rows. */
  openedPreset: MediaViewerPreset;
  /** Opened on its own (no neighbours to move to). */
  standalone: boolean;
};

export type OpenOptions = {
  preset?: MediaViewerPreset;
  standalone?: boolean;
};

const INITIAL: MediaViewerState = {
  items: [],
  openedId: null,
  currentId: null,
  openedPreset: "smooth",
  standalone: false,
};

let state: MediaViewerState = INITIAL;
const listeners = new Set<() => void>();

function setState(next: MediaViewerState) {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): MediaViewerState {
  return state;
}

function isMedia(link: Link) {
  return isMediaKind(linkKind(link));
}

function sameItems(a: readonly Link[], b: readonly Link[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * The pearl to show when the current one is gone: the next surviving one
 * after its old position, else the nearest surviving one before it.
 */
function replacementFor(
  oldItems: readonly Link[],
  currentId: string,
  survivors: ReadonlySet<string>,
): string | null {
  const at = oldItems.findIndex((item) => item.id === currentId);
  if (at === -1) return null;
  for (let i = at + 1; i < oldItems.length; i += 1) {
    if (survivors.has(oldItems[i].id)) return oldItems[i].id;
  }
  for (let i = at - 1; i >= 0; i -= 1) {
    if (survivors.has(oldItems[i].id)) return oldItems[i].id;
  }
  return null;
}

export const mediaViewer = {
  /** Registers the media pearls on screen, in display order. */
  register(links: Link[]) {
    const items = links.filter(isMedia);
    if (sameItems(items, state.items)) return;
    const ids = new Set(items.map((item) => item.id));
    let { openedId, currentId } = state;
    let closed = false;

    if (currentId !== null && !ids.has(currentId)) {
      const replacement = replacementFor(state.items, currentId, ids);
      if (replacement === null) closed = true;
      else currentId = replacement;
    }
    if (!closed && openedId !== null && !ids.has(openedId)) openedId = currentId;

    if (closed) {
      setState({ ...INITIAL, items });
      return;
    }
    setState({ ...state, items, openedId, currentId });
  },

  /** Opens the viewer on `id`; ignored when that pearl isn't registered. */
  open(id: string, options?: OpenOptions) {
    if (!state.items.some((item) => item.id === id)) return;
    setState({
      ...state,
      openedId: id,
      currentId: id,
      openedPreset: options?.preset ?? "smooth",
      standalone: options?.standalone ?? false,
    });
  },

  /** Closes the viewer, keeping the registered pearls. */
  close() {
    if (state.openedId === null && state.currentId === null) return;
    setState({
      ...state,
      openedId: null,
      currentId: null,
      openedPreset: "smooth",
      standalone: false,
    });
  },

  /** Moves to the next pearl; stays on the last. */
  next() {
    step(1);
  },

  /** Moves to the previous pearl; stays on the first. */
  prev() {
    step(-1);
  },

  /** Moves to the first pearl. */
  first() {
    jump(0);
  },

  /** Moves to the last pearl. */
  last() {
    jump(state.items.length - 1);
  },

  subscribe,
  getSnapshot,
};

/** Where the current pearl sits, or -1 when there's nowhere to move. */
function movableIndex(): number {
  if (state.currentId === null || state.standalone) return -1;
  return state.items.findIndex((item) => item.id === state.currentId);
}

function step(delta: 1 | -1) {
  const at = movableIndex();
  if (at === -1) return;
  jump(at + delta);
}

function jump(index: number) {
  if (movableIndex() === -1) return;
  const target = state.items[index];
  if (!target || target.id === state.currentId) return;
  setState({ ...state, currentId: target.id });
}

/**
 * The viewer's close has completed (the dialog let go). Faces raised for
 * the morph lower themselves then, except the one the viewer morphed back
 * into (`into`), which lowers once its own morph has played.
 */
const closeSettledListeners = new Set<(into: string | null) => void>();

export function markCloseSettled(into: string | null) {
  for (const listener of closeSettledListeners) listener(into);
}

export function onCloseSettled(listener: (into: string | null) => void): () => void {
  closeSettledListeners.add(listener);
  return () => {
    closeSettledListeners.delete(listener);
  };
}

/**
 * Set by the viewer right before it hands focus back to a pearl's button
 * on close, so that focus isn't taken for keyboard navigation (rows open
 * their hover preview on keyboard focus). One focus consumes it; it lapses
 * on its own shortly after, in case focus went nowhere.
 */
let returningFocus = false;
let returningFocusTimer: ReturnType<typeof setTimeout> | undefined;
const RETURNING_FOCUS_MS = 500;

export function markReturningFocus() {
  returningFocus = true;
  clearTimeout(returningFocusTimer);
  returningFocusTimer = setTimeout(() => {
    returningFocus = false;
  }, RETURNING_FOCUS_MS);
}

/** True once right after the viewer gave focus back (see above). */
export function consumeReturningFocus(): boolean {
  if (!returningFocus) return false;
  returningFocus = false;
  clearTimeout(returningFocusTimer);
  return true;
}

export type MediaViewerView = MediaViewerState & {
  /** Position of the current pearl, -1 while closed. */
  index: number;
  count: number;
  current: Link | null;
  hasPrev: boolean;
  hasNext: boolean;
};

/** The viewer's state plus the values derived from it. */
export function useMediaViewer(): MediaViewerView {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => INITIAL);
  return useMemo(() => {
    const index = snapshot.currentId
      ? snapshot.items.findIndex((item) => item.id === snapshot.currentId)
      : -1;
    const count = snapshot.items.length;
    return {
      ...snapshot,
      index,
      count,
      current: index === -1 ? null : snapshot.items[index],
      hasPrev: !snapshot.standalone && index > 0,
      hasNext: !snapshot.standalone && index !== -1 && index < count - 1,
    };
  }, [snapshot]);
}

/**
 * Whether `id` is the pearl the viewer opened from or is showing; a card
 * re-renders only when its own answer flips.
 */
export function useIsMediaOpen(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.openedId === id || state.currentId === id,
    () => false,
  );
}
