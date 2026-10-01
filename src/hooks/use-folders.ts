"use client";

import { useCurrentFolderContext } from "@/contexts/current-folder-context";
import { useFoldersContext } from "@/contexts/folders-context";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import {
  patchFolder,
  patchLinkFolder,
  postFolder,
  removeFolder,
  type ActionResult,
  type CreateFolderInput,
  type UpdateFolderInput,
} from "@/lib/folder-client";
import type { FolderSummary } from "@/lib/folders";
import { resolveCurrentFolder } from "@/lib/current-folder";
import { MAX_FOLDERS } from "@/lib/limits";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

export type { ActionResult, CreateFolderInput, FolderSummary, UpdateFolderInput };

/** Folder list backing the folder menus/sidebars; refreshes on every links-sync version bump. */
export function useFolders(): {
  folders: FolderSummary[];
  isLoading: boolean;
  max: number;
} {
  const { folders, isLoading } = useFoldersContext();
  return { folders, isLoading, max: MAX_FOLDERS };
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
    opts?: { folderName?: string },
  ) => Promise<ActionResult>;
} {
  const { folders, upsertFolder, removeFolderLocally } = useFoldersContext();
  const { notifyLinksChanged } = useLinksSyncActions();
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
      } else {
        toast.error(result.error);
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
      } else {
        toast.error(result.error);
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
        toast.success("Folder deleted");
        notifyLinksChanged();
        if (currentFolder?.id === id) {
          router.push("/home");
        }
      } else {
        toast.error(result.error);
      }
      return result;
    },
    [removeFolderLocally, notifyLinksChanged, currentFolder, router],
  );

  // `opts.folderName` is an optional fallback for the toast copy:
  // - moving into a folder: the name is looked up in the loaded folders
  //   list first; `opts.folderName` covers the (unlikely) case where the
  //   target isn't in that list yet, so "Moved to {name}" still fires.
  // - unfiling (`folderId: null`): there's no folder to look up (the link
  //   is leaving one), so the "Removed from {name}" copy needs the caller
  //   to pass the folder's name — e.g. from `useCurrentFolder()` on the
  //   folder page the removal happened on. Omitting it just skips the
  //   toast; the move itself still succeeds.
  const moveLink = useCallback(
    async (
      linkId: string,
      folderId: string | null,
      opts?: { folderName?: string },
    ): Promise<ActionResult> => {
      const result = await patchLinkFolder(linkId, folderId);
      if (!result.ok) {
        toast.error(result.error);
        return result;
      }

      if (folderId !== null) {
        const name =
          folders.find((folder) => folder.id === folderId)?.name ??
          opts?.folderName;
        if (name) toast.success(`Moved to ${name}`);
      } else if (opts?.folderName) {
        toast.success(`Removed from ${opts.folderName}`);
      }
      notifyLinksChanged();
      return { ok: true, data: undefined };
    },
    [folders, notifyLinksChanged],
  );

  return useMemo(
    () => ({ createFolder, updateFolder, deleteFolder, moveLink }),
    [createFolder, updateFolder, deleteFolder, moveLink],
  );
}
