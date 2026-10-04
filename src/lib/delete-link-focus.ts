"use client";

import {
  deleteLinkWithUndo,
  LINK_DELETE_FADE_MS,
} from "@/lib/pending-link-deletes";

/**
 * Deletes a link from its row or card (with Undo), and keeps keyboard
 * users in place: once it has faded out and unmounted, focus moves to the
 * next link (or the previous one, for the last), found among
 * `siblingsSelector` (every row's or card's link), but only if focus fell
 * to the page. Its ring shows only for a keyboard delete: after a click
 * the user isn't navigating by keyboard.
 */
export function deleteLinkKeepingFocus({
  linkId,
  anchor,
  siblingsSelector,
  byKeyboard,
  onDeleted,
}: {
  linkId: string;
  /** This link's own anchor (the row's or card's link). */
  anchor: HTMLElement | null;
  siblingsSelector: string;
  byKeyboard: boolean;
  /** Runs once the delete is sent (e.g. to refresh counts). */
  onDeleted: () => void;
}) {
  const links = Array.from(document.querySelectorAll<HTMLElement>(siblingsSelector));
  const index = anchor ? links.indexOf(anchor) : -1;
  const target = index >= 0 ? (links[index + 1] ?? links[index - 1] ?? null) : null;
  deleteLinkWithUndo(linkId, { onDeleted });
  setTimeout(() => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (target?.isConnected && (!active || active === document.body)) {
        // `focusVisible` isn't in TS's DOM types yet; browsers without it
        // ignore the option.
        target.focus({ focusVisible: byKeyboard } as FocusOptions);
      }
    });
  }, LINK_DELETE_FADE_MS);
}
