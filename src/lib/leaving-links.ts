"use client";

import { useSyncExternalStore } from "react";

/** How long a row that leaves the list (moved out of this folder) fades out. */
export const LINK_LEAVE_MS = 200;

/** Fired by the folder actions after links move: `{ ids, folderId }` (`null` = out of any folder). */
export const LINKS_MOVED_EVENT = "purl:links-moved";

export type LinksMovedDetail = { ids: string[]; folderId: string | null };

/** Announces a successful move, so a folder page can fade out what left it. */
export function announceLinksMoved(detail: LinksMovedDetail) {
  window.dispatchEvent(new CustomEvent(LINKS_MOVED_EVENT, { detail }));
}

/**
 * Rows leaving the list after a move (a folder page, links moved out):
 * `"fading"` while they animate out (the same exit as a delete), then
 * `"hidden"` until the list reloads without them. `since` is when each
 * started, so only a reload that began afterwards clears it.
 */
export type LeavingPhase = "fading" | "hidden";

let leaving: ReadonlyMap<string, { phase: LeavingPhase; since: number }> =
  new Map();
const listeners = new Set<() => void>();
const EMPTY: ReadonlyMap<string, { phase: LeavingPhase; since: number }> =
  new Map();

function commit(next: Map<string, { phase: LeavingPhase; since: number }>) {
  leaving = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fades `ids` out, then hides them until the next reload clears them. */
export function markLinksLeaving(ids: readonly string[]) {
  if (ids.length === 0) return;
  const since = Date.now();
  const next = new Map(leaving);
  for (const id of ids) next.set(id, { phase: "fading", since });
  commit(next);
  setTimeout(() => {
    const after = new Map(leaving);
    let changed = false;
    for (const id of ids) {
      const entry = after.get(id);
      if (entry?.phase === "fading" && entry.since === since) {
        after.set(id, { phase: "hidden", since });
        changed = true;
      }
    }
    if (changed) commit(after);
  }, LINK_LEAVE_MS);
}

/**
 * After a list reload that started at `reloadStartedAt`: the list now says
 * where every row is (gone, or back, e.g. after Undo), so drop the leaving
 * state of rows marked before that reload began.
 */
export function settleLeavingLinks(reloadStartedAt: number) {
  const next = new Map(leaving);
  let changed = false;
  for (const [id, entry] of next) {
    if (entry.since <= reloadStartedAt) {
      next.delete(id);
      changed = true;
    }
  }
  if (changed) commit(next);
}

/**
 * How long until every row now fading out has finished (0 when none is),
 * so a list reload can wait instead of cutting a fade short.
 */
export function leavingFadeRemaining(now = Date.now()): number {
  let remaining = 0;
  for (const entry of leaving.values()) {
    if (entry.phase !== "fading") continue;
    remaining = Math.max(remaining, entry.since + LINK_LEAVE_MS - now);
  }
  return remaining;
}

/** `id`'s leaving phase, or undefined when it isn't leaving. */
export function getLeavingPhase(id: string): LeavingPhase | undefined {
  return leaving.get(id)?.phase;
}

/** Every leaving row's phase, by id. */
export function useLeavingLinks(): ReadonlyMap<string, { phase: LeavingPhase }> {
  return useSyncExternalStore(subscribe, () => leaving, () => EMPTY);
}

/** Drops every leaving mark (the list they belong to is going away). */
export function clearLeavingLinks() {
  if (leaving.size === 0) return;
  commit(new Map());
}
