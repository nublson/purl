"use client";

import { linksOriginHeaders } from "@/lib/links-origin";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

/** How long the "Link deleted" toast (and its Undo) stays up before the delete is sent. */
export const LINK_DELETE_UNDO_MS = 5000;

/**
 * Links deleted from the list but not yet deleted on the server, so the
 * delete can be undone. The list hides these ids (see `LinkGroup`); the
 * DELETE request goes out when the toast closes without Undo. Ids stay in
 * the set after a successful delete: the next list reload drops the row,
 * and removing the id first would flash it back in the meantime.
 */
let pending: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
/** Deletes still waiting on their toast, run immediately if the page is left. */
const waiting = new Map<string, () => void>();
const EMPTY: ReadonlySet<string> = new Set();

function setPending(next: ReadonlySet<string>) {
  pending = next;
  for (const listener of listeners) listener();
}

function addPending(id: string) {
  const next = new Set(pending);
  next.add(id);
  setPending(next);
}

function removePending(id: string) {
  if (!pending.has(id)) return;
  const next = new Set(pending);
  next.delete(id);
  setPending(next);
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
    for (const send of Array.from(waiting.values())) send();
  });
}

/** Whether `linkId` is hidden from the list awaiting (or after) its delete. */
export function isLinkDeletePending(linkId: string): boolean {
  return pending.has(linkId);
}

/** Ids of links deleted from the list whose delete can still be undone (or was just sent). */
export function usePendingLinkDeletes(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => pending, () => EMPTY);
}

/**
 * Hides `linkId` from the list and shows "Link deleted" with Undo. Undo
 * brings the row back without touching the server; otherwise, when the toast
 * closes (timeout, swipe, close button) or the page is left, the link is
 * deleted and `onDeleted` runs (e.g. to reload the list). A failed delete
 * brings the row back with an error toast.
 */
export function deleteLinkWithUndo(
  linkId: string,
  { onDeleted }: { onDeleted: () => void },
): void {
  let settled = false;

  const send = async (keepalive: boolean) => {
    if (settled) return;
    settled = true;
    waiting.delete(linkId);
    try {
      const res = await fetch(`/api/links/${linkId}`, {
        method: "DELETE",
        headers: linksOriginHeaders,
        keepalive,
      });
      if (!res.ok) {
        removePending(linkId);
        toast.error("Unable to delete the link. Try again.");
        return;
      }
      onDeleted();
    } catch {
      removePending(linkId);
      toast.error(
        "Unable to delete the link. Check your connection and try again.",
      );
    }
  };

  const undo = () => {
    if (settled) return;
    settled = true;
    waiting.delete(linkId);
    removePending(linkId);
  };

  addPending(linkId);
  waiting.set(linkId, () => void send(true));
  bindFlushOnPageHide();

  toast.success("Link deleted", {
    duration: LINK_DELETE_UNDO_MS,
    action: { label: "Undo", onClick: undo },
    onAutoClose: () => void send(false),
    onDismiss: () => void send(false),
  });
}
