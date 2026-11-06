"use client";

import { useFoldersContext } from "@/contexts/folders-context";
import { patchFolder } from "@/lib/folder-client";
import type { FolderSummary } from "@/lib/folders";
import { folderViewSaver } from "@/lib/folder-view-savers";
import { createLatestSaver } from "@/lib/latest-saver";
import type { LinkView } from "@/lib/link-view";
import { useCallback } from "react";
import { toast } from "sonner";

const VIEW_FAILED = "Unable to change the view. Try again.";

/** Each folder as last shown, for putting the stored view back on failure. */
const shown = new Map<string, FolderSummary>();

/**
 * Sets a folder's own view (`null`: follow the account view again). Shown at
 * once (the folder list is patched locally) and saved in the background,
 * latest choice wins; a failed save puts the stored view back and toasts. In
 * the landing demo (`persist` off) it only patches the local list.
 */
export function useSetFolderView(
  /** False in the landing demo (the link-view context's `persist`). */
  persist: boolean,
): (
  folder: FolderSummary,
  view: LinkView | null,
) => void {
  const { upsertFolder, holdFetches } = useFoldersContext();

  return useCallback(
    (folder: FolderSummary, view: LinkView | null) => {
      if (folder.view === view) return;
      const next = { ...folder, view };
      shown.set(folder.id, next);
      upsertFolder(next);
      if (!persist) return;

      // Shared by every caller (`folderViewSaver`); a saver at rest may hold
      // a view the server no longer has, so a new one starts from the
      // folder's current view.
      const saver = folderViewSaver(folder.id, () =>
        createLatestSaver<LinkView | null>({
          confirmed: folder.view,
          save: async (value) => {
            // A background refetch mid-save would show the old view again.
            const release = holdFetches();
            try {
              const result = await patchFolder(folder.id, { view: value });
              if (!result.ok) throw new Error(result.error);
            } finally {
              release();
            }
          },
          onRevert: (confirmed) => {
            const current = shown.get(folder.id) ?? folder;
            upsertFolder({ ...current, view: confirmed });
            toast.error(VIEW_FAILED);
          },
        }),
      );
      saver.set(view);
    },
    [upsertFolder, holdFetches, persist],
  );
}
