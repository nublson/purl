"use client";

import { useFoldersContext } from "@/contexts/folders-context";
import { useLinksSyncActions } from "@/hooks/use-links-sync";
import {
  patchFolder,
  patchLinkFolder,
  postFolder,
  removeFolder,
  type ActionResult,
} from "@/lib/folder-client";
import type { FolderSummary } from "@/lib/folders";
import { MAX_FOLDERS } from "@/lib/limits";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

export type { ActionResult, FolderSummary };

/** Folder list backing the folder menus/sidebars; refreshes on every links-sync version bump. */
export function useFolders(): {
  folders: FolderSummary[];
  isLoading: boolean;
  max: number;
} {
  const { folders, isLoading } = useFoldersContext();
  return { folders, isLoading, max: MAX_FOLDERS };
}

/** The folder for the current `/folders/[slug]` route, or null everywhere else (e.g. /home). */
export function useCurrentFolder(): FolderSummary | null {
  const pathname = usePathname();
  const params = useParams<{ slug?: string | string[] }>();
  const { folders } = useFoldersContext();

  if (!pathname?.startsWith("/folders/")) return null;

  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  if (!slug) return null;

  return folders.find((folder) => folder.slug === slug) ?? null;
}

export function useFolderActions(): {
  createFolder: (name: string) => Promise<ActionResult<FolderSummary>>;
  renameFolder: (
    id: string,
    name: string,
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
    async (name: string): Promise<ActionResult<FolderSummary>> => {
      const result = await postFolder(name);
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

  const renameFolder = useCallback(
    async (id: string, name: string): Promise<ActionResult<FolderSummary>> => {
      const result = await patchFolder(id, name);
      if (result.ok) {
        // Same reasoning as createFolder: patch locally before the
        // router.replace below, so useCurrentFolder() on the new slug
        // resolves immediately instead of racing the background refetch.
        upsertFolder(result.data);
        toast.success("Folder renamed");
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
    [upsertFolder, notifyLinksChanged, currentFolder, pathname, router],
  );

  const deleteFolder = useCallback(
    async (
      id: string,
      opts: { withLinks: boolean },
    ): Promise<ActionResult<{ deletedLinks: number }>> => {
      const result = await removeFolder(id, opts.withLinks);
      if (result.ok) {
        // Patch locally before the /home redirect below, for the same
        // reason as createFolder/renameFolder.
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
    () => ({ createFolder, renameFolder, deleteFolder, moveLink }),
    [createFolder, renameFolder, deleteFolder, moveLink],
  );
}
