/** A shared folder page's layout: rows (the default) or a grid of cards. */
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
  return value === "grid" ? "grid" : "list";
}

/**
 * The shared folder grid's columns and gutters (2 / 3 / 4 columns of cards
 * up to 210px, 16px gutters widening to 40px from md), shared by the grid,
 * its skeleton and the description above it.
 */
export const SHARED_GRID_COLUMNS =
  "grid-cols-[repeat(2,minmax(0,210px))] justify-center gap-x-4 md:grid-cols-[repeat(3,minmax(0,210px))] md:gap-x-10 lg:grid-cols-[repeat(4,minmax(0,210px))]";
