import type { FolderSummary } from "@/lib/folders";
import type { LinkView } from "@/lib/link-view";

/**
 * One saver per folder for the whole page, not per component: the user menu
 * and the Share popover (each its own `useLinkView`, and unmounted when
 * closed) must queue behind the same in-flight save, or two requests race
 * and the older can land last.
 */
const savers = new Map<string, { idle(): boolean }>();

/**
 * The folder's saver while it has a save in flight; otherwise a new one from
 * `make` (started from the folder's current view, which may have changed
 * elsewhere since the last save).
 */
export function folderViewSaver<S extends { idle(): boolean }>(
  folderId: string,
  make: () => S,
): S {
  const existing = savers.get(folderId) as S | undefined;
  if (existing && !existing.idle()) return existing;
  const saver = make();
  savers.set(folderId, saver);
  return saver;
}

/**
 * The folder list with one folder's view changed and nothing else: newer
 * changes to that folder (a rename, sharing) stay, and a folder that's gone
 * (deleted elsewhere) isn't added back. The same list when it isn't there.
 */
export function withFolderView(
  folders: FolderSummary[],
  folderId: string,
  view: LinkView | null,
): FolderSummary[] {
  const index = folders.findIndex((folder) => folder.id === folderId);
  if (index === -1) return folders;
  const next = [...folders];
  next[index] = { ...folders[index], view };
  return next;
}
