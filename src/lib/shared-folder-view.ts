import { LINK_GRID_COLUMNS } from "@/lib/link-view";

/**
 * A shared folder page's layout: a grid of cards (the default, for
 * visitors; the owner's own folder page follows their account's view) or
 * rows.
 */
export type SharedFolderView = "list" | "grid";

/**
 * Remembers each visitor's view across shared folders. A cookie (not
 * localStorage) so the server renders the chosen view: no list-to-grid
 * flash on reload.
 */
export const SHARED_FOLDER_VIEW_COOKIE = "purl-shared-view";

export function parseSharedFolderView(
  value: string | undefined | null,
): SharedFolderView {
  return value === "list" ? "list" : "grid";
}

/** The shared folder grid: the same columns as the owner's (`link-view.ts`). */
export const SHARED_GRID_COLUMNS = LINK_GRID_COLUMNS;
