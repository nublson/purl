"use client";

import { linksOriginHeaders } from "@/lib/links-origin";
import type { Link } from "@/utils/links";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

/**
 * Reading state changed on this tab, shown before the list reloads: a row
 * marked read (opened, or from a menu) looks read at once. `settledAt` is
 * when the server confirmed it; a list reload that started after that
 * carries the same state, so it drops the override (`settleLinkReadOverrides`).
 */
type ReadOverride = { read: boolean; settledAt: number | null };

let overrides: ReadonlyMap<string, ReadOverride> = new Map();
const listeners = new Set<() => void>();
const EMPTY: ReadonlyMap<string, ReadOverride> = new Map();
/** Settles when the last queued request has finished (see `setLinksRead`). */
let queue: Promise<void> = Promise.resolve();

function commit(next: Map<string, ReadOverride>) {
  overrides = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether `link` reads as read: this tab's latest change, else the server's. */
export function isLinkRead(
  link: Pick<Link, "id" | "readAt">,
  current: ReadonlyMap<string, ReadOverride> = overrides,
): boolean {
  return current.get(link.id)?.read ?? link.readAt !== null;
}

/** This tab's pending reading-state changes, by link id. */
export function useLinkReadOverrides(): ReadonlyMap<string, ReadOverride> {
  return useSyncExternalStore(subscribe, () => overrides, () => EMPTY);
}

/** Whether `link` reads as read, following this tab's changes. */
export function useIsLinkRead(link: Pick<Link, "id" | "readAt">): boolean {
  return isLinkRead(link, useLinkReadOverrides());
}

/**
 * Marks `ids` read or unread: the rows change at once, then the server
 * follows. One link goes through `PATCH /api/links/[id]`, several through
 * the bulk endpoint. `keepalive`, so opening a link (which can leave the
 * page) still records it. On failure the rows go back and a toast says so.
 */
export async function setLinksRead(
  ids: readonly string[],
  read: boolean,
): Promise<boolean> {
  if (ids.length === 0) return true;
  const previous = new Map(ids.map((id) => [id, overrides.get(id)]));
  const next = new Map(overrides);
  for (const id of ids) next.set(id, { read, settledAt: null });
  commit(next);

  const single = ids.length === 1;
  let ok = false;
  // One request at a time, in order: a quick read-then-unread must reach
  // the server in that order, or the link ends up read while showing unread.
  const turn = queue;
  let done = () => {};
  queue = new Promise<void>((resolve) => (done = resolve));
  await turn;
  try {
    const res = await fetch(
      single
        ? `/api/links/${encodeURIComponent(ids[0])}`
        : "/api/links/bulk",
      {
        method: "PATCH",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...linksOriginHeaders },
        body: JSON.stringify(single ? { read } : { ids, read }),
      },
    );
    ok = res.ok;
  } catch {
    ok = false;
  } finally {
    done();
  }

  // Only the entries this call wrote: a later change to the same link wins.
  const after = new Map(overrides);
  let changed = false;
  for (const id of ids) {
    const entry = after.get(id);
    if (entry?.read !== read || entry.settledAt !== null) continue;
    const before = previous.get(id);
    if (ok) after.set(id, { read, settledAt: Date.now() });
    else if (before) after.set(id, before);
    else after.delete(id);
    changed = true;
  }
  if (changed) commit(after);

  if (!ok) {
    const what = ids.length === 1 ? "the link" : "the links";
    toast.error(`Unable to mark ${what} as ${read ? "read" : "unread"}. Try again.`);
  }
  return ok;
}

/**
 * After a list reload that started at `reloadStartedAt`: changes the server
 * confirmed before then are in the reloaded links, so their overrides go
 * (and changes from other devices show again).
 */
export function settleLinkReadOverrides(reloadStartedAt: number) {
  const next = new Map(overrides);
  let changed = false;
  for (const [id, entry] of next) {
    if (entry.settledAt !== null && entry.settledAt <= reloadStartedAt) {
      next.delete(id);
      changed = true;
    }
  }
  if (changed) commit(next);
}
