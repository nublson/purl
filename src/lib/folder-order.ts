import type { ActionResult } from "./folder-client";
import type { FolderSummary } from "./folders";

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

/** The user's folder order: position, then name (case-insensitive) for ties. */
export function byPosition(a: FolderSummary, b: FolderSummary): number {
  return a.position - b.position || collator.compare(a.name, b.name);
}

/** `folders` in the order of `ids`, with positions rewritten to 1..n. */
export function applyFolderOrder(
  folders: FolderSummary[],
  ids: string[],
): FolderSummary[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  return ids.flatMap((id, index) => {
    const folder = byId.get(id);
    return folder ? [{ ...folder, position: index + 1 }] : [];
  });
}

export const SAVE_ORDER_ERROR = "Couldn't save folder order";
export const STALE_ORDER_ERROR = "Your folders changed elsewhere. Try again.";

/**
 * Saves a new folder order optimistically: shows it at once, then adopts the
 * server's list. On failure it puts `previous` back and says so; when the
 * server rejects the list as stale (`INVALID_ORDER`, a folder was added or
 * deleted elsewhere) it also refreshes the folders.
 */
export async function saveFolderOrder(
  ids: string[],
  deps: {
    previous: FolderSummary[];
    setFolders: (folders: FolderSummary[]) => void;
    put: (ids: string[]) => Promise<ActionResult<{ folders: FolderSummary[] }>>;
    refresh: () => void;
    notify: (message: string) => void;
  },
): Promise<ActionResult<FolderSummary[]>> {
  deps.setFolders(applyFolderOrder(deps.previous, ids));
  const result = await deps.put(ids);
  if (result.ok) {
    deps.setFolders(result.data.folders);
    return { ok: true, data: result.data.folders };
  }
  deps.setFolders(deps.previous);
  if (result.code === "INVALID_ORDER") {
    deps.refresh();
    deps.notify(STALE_ORDER_ERROR);
  } else {
    deps.notify(SAVE_ORDER_ERROR);
  }
  return result;
}
