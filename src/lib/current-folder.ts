import type { FolderSummary } from "@/lib/folders";

/**
 * Pure resolution behind `useCurrentFolder()`:
 * - `pageFolder` set (inside a folder page's `CurrentFolderProvider`): key on
 *   its **id** — the fresh list entry when present (rename → new
 *   name/slug/linkCount), else `pageFolder` itself (e.g. deleted in another
 *   tab; the save then 404s instead of landing unfiled).
 * - otherwise: on a `/folders/…` path, match `slug` against the list; null
 *   everywhere else.
 */
export function resolveCurrentFolder({
  pageFolder,
  folders,
  pathname,
  slug,
}: {
  pageFolder: FolderSummary | null;
  folders: FolderSummary[];
  pathname: string | null;
  slug: string | undefined;
}): FolderSummary | null {
  if (pageFolder) {
    return folders.find((folder) => folder.id === pageFolder.id) ?? pageFolder;
  }
  if (!pathname?.startsWith("/folders/") || !slug) return null;
  return folders.find((folder) => folder.slug === slug) ?? null;
}
