"use client";

import { usePersistLayout } from "@/contexts/link-view-context";
import { useFoldersContext } from "@/contexts/folders-context";
import { patchFolder } from "@/lib/folder-client";
import type { FolderSummary } from "@/lib/folders";
import { createLatestSaver } from "@/lib/latest-saver";
import type { LinkView } from "@/lib/link-view";
import { useCallback, useRef } from "react";
import { toast } from "sonner";

type FolderViewSaver = ReturnType<typeof createLatestSaver<LinkView | null>>;

const VIEW_FAILED = "Unable to change the view. Try again.";

/**
 * Sets a folder's own view (`null`: follow the account view again). Shown at
 * once (the folder list is patched locally) and saved in the background,
 * latest choice wins; a failed save puts the stored view back and toasts. In
 * the landing demo (`persist` off) it only patches the local list.
 */
export function useSetFolderView(): (
  folder: FolderSummary,
  view: LinkView | null,
) => void {
  const { upsertFolder, holdFetches } = useFoldersContext();
  const persist = usePersistLayout();
  const savers = useRef(new Map<string, FolderViewSaver>());
  // The folder as last shown, for putting the stored view back on failure.
  const shown = useRef(new Map<string, FolderSummary>());

  return useCallback(
    (folder: FolderSummary, view: LinkView | null) => {
      if (folder.view === view) return;
      const next = { ...folder, view };
      shown.current.set(folder.id, next);
      upsertFolder(next);
      if (!persist) return;

      let saver = savers.current.get(folder.id);
      // A saver at rest may hold a view the server no longer has (changed
      // on another device): start from the folder's current one instead.
      if (!saver || saver.idle()) {
        saver = createLatestSaver<LinkView | null>({
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
            const current = shown.current.get(folder.id) ?? folder;
            upsertFolder({ ...current, view: confirmed });
            toast.error(VIEW_FAILED);
          },
        });
        savers.current.set(folder.id, saver);
      }
      saver.set(view);
    },
    [upsertFolder, holdFetches, persist],
  );
}
