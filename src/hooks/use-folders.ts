"use client";

import { useCurrentFolderContext } from "@/contexts/current-folder-context";
import { useFoldersContext } from "@/contexts/folders-context";
import { useLinksSyncActions, useLinksSyncState } from "@/hooks/use-links-sync";
import { groupByPreviousFolder } from "@/lib/bulk-links";
import {
  patchFolder,
  patchLinkFolder,
  patchLinksFolder,
  postFolder,
  removeFolder,
  type ActionResult,
  type CreateFolderInput,
  type UpdateFolderInput,
} from "@/lib/folder-client";
import type { FolderSummary } from "@/lib/folders";
import { resolveCurrentFolder } from "@/lib/current-folder";
import {
  formatBulkMoveMessage,
  formatFolderLabel,
  formatLinkCount,
} from "@/lib/folder-display";
import { MAX_FOLDERS } from "@/lib/limits";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

export type { ActionResult, CreateFolderInput, FolderSummary, UpdateFolderInput };

/**
 * Latest move per link id. A move's Undo only applies while it is still the
 * link's latest move, so an older toast can't revert a newer choice.
 */
const latestMoveByLink = new Map<string, symbol>();

/** Numbers bulk-move toasts, so each batch keeps its own toast and Undo. */
let bulkMoveCount = 0;

/**
 * Folder list backing the folder menus/sidebars; refreshes on every
 * links-sync version bump, or on `refresh()` for a change that reloads its
 * own list without bumping the version (a save on a folder page).
 * `totalLinks` is Home's count (every saved link): the live links-sync total
 * once a list reload has reported one, else the server-rendered count;
 * `null` when neither is known.
 */
export function useFolders(): {
  folders: FolderSummary[];
  isLoading: boolean;
  max: number;
  totalLinks: number | null;
  refresh: () => void;
} {
  const { folders, isLoading, initialTotalLinks, refresh } =
    useFoldersContext();
  const { total } = useLinksSyncState();
  return {
    folders,
    isLoading,
    max: MAX_FOLDERS,
    totalLinks: total ?? initialTotalLinks,
    refresh,
  };
}

/**
 * The folder for the current `/folders/[slug]` route, or null everywhere else (e.g. /home).
 *
 * Inside the folder page (wrapped in `CurrentFolderProvider`) this is keyed on
 * the page's server-resolved folder **id**: the fresh entry from the folder
 * list when it's there (so a rename's new name/slug/linkCount shows up), else
 * the page's own copy (e.g. the folder was deleted in another tab — the save
 * then fails loudly with "Folder not found" instead of landing unfiled).
 * Outside that subtree (e.g. the layout's header) it falls back to matching
 * the URL slug against the folder list.
 */
export function useCurrentFolder(): FolderSummary | null {
  const pathname = usePathname();
  const params = useParams<{ slug?: string | string[] }>();
  const { folders } = useFoldersContext();
  const pageFolder = useCurrentFolderContext();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  return resolveCurrentFolder({ pageFolder, folders, pathname, slug });
}

/**
 * Folder mutations. Each returns `{ ok: true, data } | { ok: false, error }`
 * and never throws. On success they toast, refresh the folder list and
 * navigate (create → the new folder; update → its new slug if you're on it;
 * delete → /home if you're on it). On failure `createFolder`, `updateFolder`
 * and `deleteFolder` stay silent: their callers (the folder dialogs) show
 * `error` inline. `moveLink` and `moveLinks` have no dialog, so they toast
 * their own failures.
 */
export function useFolderActions(): {
  createFolder: (
    input: CreateFolderInput,
  ) => Promise<ActionResult<FolderSummary>>;
  updateFolder: (
    id: string,
    input: UpdateFolderInput,
  ) => Promise<ActionResult<FolderSummary>>;
  deleteFolder: (
    id: string,
    opts: { withLinks: boolean },
  ) => Promise<ActionResult<{ deletedLinks: number }>>;
  moveLink: (
    linkId: string,
    folderId: string | null,
    opts?: { from?: string | null },
  ) => Promise<ActionResult>;
  moveLinks: (
    linkIds: string[],
    folderId: string | null,
  ) => Promise<ActionResult<{ moved: number }>>;
} {
  const { folders, upsertFolder, removeFolderLocally, initialTotalLinks } =
    useFoldersContext();
  const { notifyLinksChanged, setLinksTotal } = useLinksSyncActions();
  const { total } = useLinksSyncState();
  const router = useRouter();
  const pathname = usePathname();
  const currentFolder = useCurrentFolder();

  const createFolder = useCallback(
    async (input: CreateFolderInput): Promise<ActionResult<FolderSummary>> => {
      const result = await postFolder(input);
      if (result.ok) {
        // Patch the list locally before navigating: the background refetch
        // triggered by notifyLinksChanged() hasn't landed yet, and without
        // this the new folder page's useCurrentFolder() would briefly (and
        // wrongly) resolve to null on the very next render.
        upsertFolder(result.data);
        toast.success("Folder created");
        notifyLinksChanged();
        router.push(`/folders/${result.data.slug}`);
      }
      return result;
    },
    [upsertFolder, notifyLinksChanged, router],
  );

  const updateFolder = useCallback(
    async (
      id: string,
      input: UpdateFolderInput,
    ): Promise<ActionResult<FolderSummary>> => {
      // Captured before the request: the local list is patched below.
      const previousName = folders.find((folder) => folder.id === id)?.name;
      const result = await patchFolder(id, input);
      if (result.ok) {
        const renamed =
          input.name !== undefined &&
          (previousName === undefined || previousName !== result.data.name);
        // Same reasoning as createFolder: patch locally before the
        // router.replace below, so useCurrentFolder() on the new slug
        // resolves immediately instead of racing the background refetch.
        upsertFolder(result.data);
        toast.success(renamed ? "Folder renamed" : "Folder updated");
        notifyLinksChanged();
        const onThisFolder = currentFolder?.id === id;
        const newPath = `/folders/${result.data.slug}`;
        if (onThisFolder && pathname !== newPath) {
          router.replace(newPath);
        }
      }
      return result;
    },
    [folders, upsertFolder, notifyLinksChanged, currentFolder, pathname, router],
  );

  const deleteFolder = useCallback(
    async (
      id: string,
      opts: { withLinks: boolean },
    ): Promise<ActionResult<{ deletedLinks: number }>> => {
      const result = await removeFolder(id, opts.withLinks);
      if (result.ok) {
        // Patch locally before the /home redirect below, for the same
        // reason as createFolder/updateFolder.
        removeFolderLocally(id);
        // Deleted links leave Home's count. Set it here: when this was the
        // current folder, the folder page's own reload (which normally
        // reports the total) fails because the folder is gone.
        const knownTotal = total ?? initialTotalLinks;
        if (result.data.deletedLinks > 0 && knownTotal !== null) {
          setLinksTotal(Math.max(0, knownTotal - result.data.deletedLinks));
        }
        toast.success(
          result.data.deletedLinks > 0
            ? `Folder and ${formatLinkCount(result.data.deletedLinks)} deleted`
            : "Folder deleted",
        );
        notifyLinksChanged();
        if (currentFolder?.id === id) {
          router.push("/home");
        }
      }
      return result;
    },
    [
      removeFolderLocally,
      notifyLinksChanged,
      setLinksTotal,
      total,
      initialTotalLinks,
      currentFolder,
      router,
    ],
  );

  // `opts.from` is the folder the link is leaving (`null` = none). Passing
  // it names that folder in "Removed from …" and adds an Undo action that
  // moves the link back; omit it and the toast has no Undo. Folder labels
  // come from the loaded folder list ("🦪 Reading").
  const moveLink = useCallback(
    async (
      linkId: string,
      folderId: string | null,
      opts?: { from?: string | null },
    ): Promise<ActionResult> => {
      const result = await patchLinkFolder(linkId, folderId);
      if (!result.ok) {
        toast.error(result.error);
        return result;
      }

      const target = folders.find((folder) => folder.id === folderId);
      const source = folders.find((folder) => folder.id === opts?.from);
      const message = target
        ? `Moved to ${formatFolderLabel(target)}`
        : source
          ? `Removed from ${formatFolderLabel(source)}`
          : null;
      const from = opts?.from;
      const move = Symbol(linkId);
      latestMoveByLink.set(linkId, move);
      const undo =
        from === undefined
          ? undefined
          : {
              label: "Undo",
              onClick: async () => {
                if (latestMoveByLink.get(linkId) !== move) return;
                latestMoveByLink.delete(linkId);
                const reverted = await patchLinkFolder(linkId, from);
                if (!reverted.ok) {
                  toast.error(reverted.error);
                  return;
                }
                notifyLinksChanged();
              },
            };
      // One toast per link: a newer move replaces the older toast (and its
      // Undo) instead of stacking under it.
      if (message) {
        toast.success(message, { id: `link-move-${linkId}`, action: undo });
      }
      notifyLinksChanged();
      return { ok: true, data: undefined };
    },
    [folders, notifyLinksChanged],
  );

  // Bulk move (the selection bar). One toast for the whole batch, with an
  // Undo that puts each link back in the folder it came from (the server
  // reports those), skipping links moved again since.
  const moveLinks = useCallback(
    async (
      linkIds: string[],
      folderId: string | null,
    ): Promise<ActionResult<{ moved: number }>> => {
      const result = await patchLinksFolder(linkIds, folderId);
      if (!result.ok) {
        toast.error(result.error);
        return result;
      }
      const { moved } = result.data;
      if (moved.length === 0) {
        const error = "Those links no longer exist.";
        toast.error(error);
        notifyLinksChanged();
        return { ok: false, error };
      }

      const move = Symbol("bulk-move");
      for (const { id } of moved) latestMoveByLink.set(id, move);
      const sourceIds = new Set(moved.map((link) => link.previousFolderId));
      const [onlySource] = sourceIds;
      const source =
        sourceIds.size === 1
          ? (folders.find((folder) => folder.id === onlySource) ?? null)
          : null;
      const target = folders.find((folder) => folder.id === folderId) ?? null;

      toast.success(
        formatBulkMoveMessage({ count: moved.length, target, source }),
        {
          // Its own toast: a later batch of other links must not replace
          // this one and take its Undo away.
          id: `links-move-${++bulkMoveCount}`,
          action: {
            label: "Undo",
            onClick: async () => {
              const stillLatest = moved.filter(
                ({ id }) => latestMoveByLink.get(id) === move,
              );
              for (const { id } of stillLatest) latestMoveByLink.delete(id);
              const results = await Promise.all(
                Array.from(groupByPreviousFolder(stillLatest)).map(
                  ([previousFolderId, ids]) =>
                    patchLinksFolder(ids, previousFolderId),
                ),
              );
              const failed = results.find((reverted) => !reverted.ok);
              if (failed && !failed.ok) toast.error(failed.error);
              notifyLinksChanged();
            },
          },
        },
      );
      notifyLinksChanged();
      return { ok: true, data: { moved: moved.length } };
    },
    [folders, notifyLinksChanged],
  );

  return useMemo(
    () => ({ createFolder, updateFolder, deleteFolder, moveLink, moveLinks }),
    [createFolder, updateFolder, deleteFolder, moveLink, moveLinks],
  );
}
