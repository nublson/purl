"use client";

import { useFoldersContext } from "@/contexts/folders-context";
import { patchFolderView } from "@/lib/folder-client";
import type { FolderSummary } from "@/lib/folders";
import {
  type FolderViewField,
  folderViewSaver,
} from "@/lib/folder-view-savers";
import { createLatestSaver } from "@/lib/latest-saver";
import type { LinkView } from "@/lib/link-view";
import { useCallback } from "react";
import { toast } from "sonner";

const VIEW_FAILED = "Unable to change the view. Try again.";

/**
 * Sets one of a folder's views (`field`): its own (`view`, the user menu's;
 * `null` follows the account view again) or its shared page's (`sharedView`,
 * the Share popover's; `null` follows the owner's). Shown at
 * once (only the view is patched in the local list) and saved in the
 * background, latest choice wins, each request time-limited
 * (`patchFolderView`, so a stalled one can't hold folder refreshes); a failed
 * save puts the stored view back and toasts. In the landing demo (`persist`
 * off) it only patches the local list.
 */
export function useSetFolderView(
  /** False in the landing demo (the link-view context's `persist`). */
  persist: boolean,
  field: FolderViewField = "view",
): (folder: FolderSummary, view: LinkView | null) => void {
  const { setFolderViewLocally, holdFetches } = useFoldersContext();

  return useCallback(
    (folder: FolderSummary, view: LinkView | null) => {
      if (folder[field] === view) return;
      setFolderViewLocally(folder.id, view, field);
      if (!persist) return;

      // Shared by every caller (`folderViewSaver`); a saver at rest may hold
      // a view the server no longer has, so a new one starts from the
      // folder's current view.
      const saver = folderViewSaver(
        folder.id,
        () =>
          createLatestSaver<LinkView | null>({
            confirmed: folder[field],
            save: async (value) => {
              // A background refetch mid-save would show the old view again.
              const release = holdFetches();
              try {
                const result = await patchFolderView(folder.id, value, field);
                if (!result.ok) throw new Error(result.error);
              } finally {
                release();
              }
            },
            onRevert: (confirmed) => {
              // Only the view goes back: a rename or sharing change made
              // meanwhile stays, and a folder deleted meanwhile stays gone.
              setFolderViewLocally(folder.id, confirmed, field);
              toast.error(VIEW_FAILED);
            },
          }),
        field,
      );
      saver.set(view);
    },
    [setFolderViewLocally, holdFetches, persist, field],
  );
}
