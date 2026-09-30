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
    previousFolderName?: string,
  ) => Promise<ActionResult>;
} {
  const { folders, refresh } = useFoldersContext();
  const { notifyLinksChanged } = useLinksSyncActions();
  const router = useRouter();
  const pathname = usePathname();
  const currentFolder = useCurrentFolder();

  const createFolder = async (
    name: string,
  ): Promise<ActionResult<FolderSummary>> => {
    const result = await postFolder(name);
    if (result.ok) {
      toast.success("Folder created");
      refresh();
      notifyLinksChanged();
      router.push(`/folders/${result.data.slug}`);
    } else {
      toast.error(result.error);
    }
    return result;
  };

  const renameFolder = async (
    id: string,
    name: string,
  ): Promise<ActionResult<FolderSummary>> => {
    const result = await patchFolder(id, name);
    if (result.ok) {
      toast.success("Folder renamed");
      refresh();
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
  };

  const deleteFolder = async (
    id: string,
    opts: { withLinks: boolean },
  ): Promise<ActionResult<{ deletedLinks: number }>> => {
    const result = await removeFolder(id, opts.withLinks);
    if (result.ok) {
      toast.success("Folder deleted");
      refresh();
      notifyLinksChanged();
      if (currentFolder?.id === id) {
        router.push("/home");
      }
    } else {
      toast.error(result.error);
    }
    return result;
  };

  // Optional `previousFolderName`: the "Removed from {name}" copy needs the
  // folder the link is leaving, which the server response (just the link's
  // new folderId) doesn't carry — callers on a folder page already know it
  // from `useCurrentFolder()`/the row's own folder badge.
  const moveLink = async (
    linkId: string,
    folderId: string | null,
    previousFolderName?: string,
  ): Promise<ActionResult> => {
    const result = await patchLinkFolder(linkId, folderId);
    if (!result.ok) {
      toast.error(result.error);
      return result;
    }

    if (folderId !== null) {
      const target = folders.find((folder) => folder.id === folderId);
      if (target) toast.success(`Moved to ${target.name}`);
    } else if (previousFolderName) {
      toast.success(`Removed from ${previousFolderName}`);
    }
    refresh();
    notifyLinksChanged();
    return { ok: true, data: undefined };
  };

  return { createFolder, renameFolder, deleteFolder, moveLink };
}
