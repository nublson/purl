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

function setPhase(id: string, phase: PendingLinkDeletePhase | null) {
  if (phase === null && !pending.has(id)) return;
  const next = new Map(pending);
  if (phase === null) next.delete(id);
  else next.set(id, phase);
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
  { onDeleted }: { onDeleted: () => void },
): void {
  if (waiting.has(linkId)) return;
  let settled = false;
  const toastId = `link-delete-${linkId}`;

  setPhase(linkId, "fading");
  const hideTimer = setTimeout(() => {
    if (pending.get(linkId) === "fading") setPhase(linkId, "hidden");
  }, LINK_DELETE_FADE_MS);

  const send = async () => {
    if (settled) return;
    settled = true;
    waiting.delete(linkId);
    setPhase(linkId, "hidden");
    try {
      const res = await fetch(`/api/links/${linkId}`, {
        method: "DELETE",
        headers: linksOriginHeaders,
        // Always keepalive: the toast can close right before a reload or
        // navigation, and a normal fetch that hasn't gone out yet would be
        // cancelled with the page.
        keepalive: true,
      });
      if (!res.ok) {
        setPhase(linkId, null);
        toast.error("Unable to delete the link. Try again.");
        return;
      }
      onDeleted();
    } catch {
      setPhase(linkId, null);
      toast.error(
        "Unable to delete the link. Check your connection and try again.",
      );
    }
  };

  const cancel = () => {
    if (settled) return;
    settled = true;
    clearTimeout(hideTimer);
    waiting.delete(linkId);
    setPhase(linkId, null);
    toast.dismiss(toastId);
  };

  waiting.set(linkId, { send: () => void send(), cancel });
  bindFlushOnPageHide();

  toast.success("Link deleted", {
    id: toastId,
    duration: LINK_DELETE_UNDO_MS,
    action: { label: "Undo", onClick: cancel },
    onAutoClose: () => void send(),
    onDismiss: () => void send(),
  });
}
