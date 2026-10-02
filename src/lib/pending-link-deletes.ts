"use client";

import { linksOriginHeaders } from "@/lib/links-origin";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

/** How long the "Link deleted" toast (and its Undo) stays up before the delete is sent. */
export const LINK_DELETE_UNDO_MS = 5000;

/** How long a deleted row fades out before it's hidden (matches the row's `duration-200` exit). */
export const LINK_DELETE_FADE_MS = 200;

/**
 * Where a deleted link is in the list: `"fading"` while its row animates
 * out, then `"hidden"`. The list hides `"hidden"` ids (see `LinkGroup`).
 */
export type PendingLinkDeletePhase = "fading" | "hidden";

/**
 * Links deleted from the list but not yet deleted on the server, so the
 * delete can be undone. The DELETE request goes out when the toast closes
 * without Undo. Ids stay after a successful delete: the next list reload
 * drops the row, and removing the id first would flash it back meanwhile.
 *
 * Everything (fade timer, toast, request) lives here rather than in the row,
 * so a delete the user chose survives the row unmounting (e.g. navigating
 * away mid-fade).
 */
let pending: ReadonlyMap<string, PendingLinkDeletePhase> = new Map();
const listeners = new Set<() => void>();
/** Undoable deletes, by link id: `send` runs it now (page left), `cancel` undoes it. */
const waiting = new Map<string, { send: () => void; cancel: () => void }>();
const EMPTY: ReadonlyMap<string, PendingLinkDeletePhase> = new Map();

/** Sets (or, with `null`, clears) the phase of every id in one update. */
function setPhase(
  ids: string | Iterable<string>,
  phase: PendingLinkDeletePhase | null,
) {
  const list = typeof ids === "string" ? [ids] : Array.from(ids);
  if (list.length === 0) return;
  if (phase === null && !list.some((id) => pending.has(id))) return;
  const next = new Map(pending);
  for (const id of list) {
    if (phase === null) next.delete(id);
    else next.set(id, phase);
  }
  pending = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let flushOnPageHideBound = false;

/**
 * Leaving or closing the page doesn't wait for the toast: the delete the
 * user asked for is sent right away (`keepalive` lets it outlive the page).
 */
function bindFlushOnPageHide() {
  if (flushOnPageHideBound || typeof window === "undefined") return;
  flushOnPageHideBound = true;
  window.addEventListener("pagehide", () => {
    for (const { send } of Array.from(waiting.values())) send();
  });
}

/** Whether `linkId` was deleted from the list (fading, hidden, or already sent). */
export function isLinkDeletePending(linkId: string): boolean {
  return pending.has(linkId);
}

/** `linkId`'s delete phase, or `undefined` when it isn't being deleted. */
export function getLinkDeletePhase(
  linkId: string,
): PendingLinkDeletePhase | undefined {
  return pending.get(linkId);
}

/** Deleted links' phases, by id; ids not in the map are not being deleted. */
export function usePendingLinkDeletes(): ReadonlyMap<
  string,
  PendingLinkDeletePhase
> {
  return useSyncExternalStore(subscribe, () => pending, () => EMPTY);
}

/**
 * Undoes a pending delete of `linkId` as if Undo were clicked (and closes its
 * toast). Used when the same link is saved again inside the Undo window:
 * a re-save returns the existing link's id, which must not stay hidden and
 * then be deleted. No-op once the delete has been sent.
 */
export function cancelPendingLinkDelete(linkId: string): void {
  waiting.get(linkId)?.cancel();
}

/**
 * Fades `linkId` out, hides it from the list and shows "Link deleted" with
 * Undo. Undo brings the row back without touching the server; otherwise,
 * when the toast closes (timeout, swipe, close button) or the page is left,
 * the link is deleted and `onDeleted` runs (e.g. to reload the list). A
 * failed delete brings the row back with an error toast.
 */
export function deleteLinkWithUndo(
  linkId: string,
  opts: { onDeleted: () => void },
): void {
  deleteLinksWithUndo([linkId], opts);
}

let batchCount = 0;

/**
 * `deleteLinkWithUndo` for many links (the selection bar): one "3 links
 * deleted" toast whose Undo brings them all back, and one request when it
 * closes. Links already being deleted are skipped. Saving one of them again
 * inside the Undo window (`cancelPendingLinkDelete`) takes just that link
 * out of the batch.
 */
export function deleteLinksWithUndo(
  linkIds: string[],
  { onDeleted }: { onDeleted: () => void },
): void {
  const ids = Array.from(new Set(linkIds)).filter((id) => !waiting.has(id));
  if (ids.length === 0) return;
  // Links still in this batch: not undone, not re-saved.
  const remaining = new Set(ids);
  let settled = false;
  const toastId =
    ids.length === 1 ? `link-delete-${ids[0]}` : `links-delete-${++batchCount}`;

  setPhase(ids, "fading");
  const hideTimer = setTimeout(() => {
    setPhase(
      Array.from(remaining).filter((id) => pending.get(id) === "fading"),
      "hidden",
    );
  }, LINK_DELETE_FADE_MS);

  const send = async () => {
    if (settled) return;
    settled = true;
    const toDelete = Array.from(remaining);
    for (const id of toDelete) waiting.delete(id);
    setPhase(toDelete, "hidden");
    const restore = (message: string) => {
      setPhase(toDelete, null);
      toast.error(message);
    };
    const what = toDelete.length === 1 ? "the link" : "the links";
    try {
      // Always keepalive: the toast can close right before a reload or
      // navigation, and a normal fetch that hasn't gone out yet would be
      // cancelled with the page.
      const res =
        toDelete.length === 1
          ? await fetch(`/api/links/${toDelete[0]}`, {
              method: "DELETE",
              headers: linksOriginHeaders,
              keepalive: true,
            })
          : await fetch("/api/links/bulk", {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                ...linksOriginHeaders,
              },
              body: JSON.stringify({ ids: toDelete }),
              keepalive: true,
            });
      if (!res.ok) {
        restore(`Unable to delete ${what}. Try again.`);
        return;
      }
      onDeleted();
    } catch {
      restore(`Unable to delete ${what}. Check your connection and try again.`);
    }
  };

  // Undo: every link in the batch comes back.
  const cancelAll = () => {
    if (settled) return;
    settled = true;
    clearTimeout(hideTimer);
    for (const id of remaining) waiting.delete(id);
    setPhase(remaining, null);
    remaining.clear();
    toast.dismiss(toastId);
  };

  // A re-save: only that link comes back; the rest stay deleted.
  const cancelOne = (id: string) => {
    if (settled || !remaining.has(id)) return;
    if (remaining.size === 1) {
      cancelAll();
      return;
    }
    remaining.delete(id);
    waiting.delete(id);
    setPhase(id, null);
  };

  for (const id of ids) {
    waiting.set(id, { send: () => void send(), cancel: () => cancelOne(id) });
  }
  bindFlushOnPageHide();

  toast.success(
    ids.length === 1 ? "Link deleted" : `${ids.length} links deleted`,
    {
      id: toastId,
      duration: LINK_DELETE_UNDO_MS,
      action: { label: "Undo", onClick: cancelAll },
      onAutoClose: () => void send(),
      onDismiss: () => void send(),
    },
  );
}
