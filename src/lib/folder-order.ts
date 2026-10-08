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
 * server's list. Background folder fetches are held (`hold`) until the save
 * settles, so one started mid-save can't flash the old order back. On
 * failure it puts `previous` back, reloads the folders (the snapshot may
 * miss a change made meanwhile) and says why. A save overtaken by a newer
 * one (`isCurrent` false, e.g. a second drop) leaves the list to it.
 */
export async function saveFolderOrder(
  ids: string[],
  deps: {
    previous: FolderSummary[];
    /**
     * Where a failure lands; defaults to `previous`. Give the last saved
     * order when `previous` may be an earlier save's unconfirmed one.
     */
    rollbackTo?: FolderSummary[];
    setFolders: (folders: FolderSummary[]) => void;
    put: (ids: string[]) => Promise<ActionResult<{ folders: FolderSummary[] }>>;
    refresh: () => void;
    notify: (message: string) => void;
    /** Holds background fetches; returns the release. */
    hold: () => () => void;
    /** False once a newer save has started. */
    isCurrent: () => boolean;
  },
): Promise<ActionResult<FolderSummary[]>> {
  const release = deps.hold();
  deps.setFolders(applyFolderOrder(deps.previous, ids));
  let result: ActionResult<{ folders: FolderSummary[] }>;
  try {
    result = await deps.put(ids);
  } finally {
    release();
  }
  if (!deps.isCurrent()) {
    return result.ok ? { ok: true, data: result.data.folders } : result;
  }
  if (result.ok) {
    deps.setFolders(result.data.folders);
    return { ok: true, data: result.data.folders };
  }
  deps.setFolders(deps.rollbackTo ?? deps.previous);
  deps.refresh();
  deps.notify(
    result.code === "INVALID_ORDER" ? STALE_ORDER_ERROR : SAVE_ORDER_ERROR,
  );
  return result;
}
