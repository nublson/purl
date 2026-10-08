/**
 * How the owner's lists (Home, folders) show links: rows, or a grid of
 * cards. Saved on the account (`User.linkView`), changed from the user
 * menu. The shared folder page has its own, per visitor
 * (`shared-folder-view.ts`).
 */
export type LinkView = "list" | "grid";

/**
 * The owner's layout settings, saved on the account: the view, and whether
 * Home tags each link with its folder (`User.showFolderTags`, off by
 * default).
 */
export type LayoutPrefs = { view: LinkView; folderTags: boolean };

export const DEFAULT_LAYOUT: LayoutPrefs = { view: "list", folderTags: false };

/**
 * A layout change from a request body: `view` and/or `folderTags`, at
 * least one, each valid; null otherwise.
 */
export function parseLayoutChange(body: unknown): Partial<LayoutPrefs> | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as { view?: unknown; folderTags?: unknown };
  const change: Partial<LayoutPrefs> = {};
  if ("view" in record) {
    const view = parseLinkView(record.view);
    if (!view) return null;
    change.view = view;
  }
  if ("folderTags" in record) {
    if (typeof record.folderTags !== "boolean") return null;
    change.folderTags = record.folderTags;
  }
  return Object.keys(change).length > 0 ? change : null;
}

/** A request body's or a stored value's view; anything else is invalid. */
export function parseLinkView(value: unknown): LinkView | null {
  return value === "list" || value === "grid" ? value : null;
}

/** The database enum (`LIST` / `GRID`) as the app's view, and back. */
export function linkViewFromDb(value: "LIST" | "GRID"): LinkView {
  return value === "GRID" ? "grid" : "list";
}

export function linkViewToDb(view: LinkView): "LIST" | "GRID" {
  return view === "grid" ? "GRID" : "LIST";
}

/**
 * A grid of link cards: 2 / 3 / 4 columns (phone / sm / lg) of cards up
 * to 210px, centered, 16px gutters widening to 40px from md. Three start
 * at sm (640px), not md, so small tablets (an iPad mini's 744px portrait,
 * split view) get them too; cards shrink to ~190px until md. Shared by
 * the owner's grid, the shared folder's, their skeletons and anything
 * lined up with them.
 */
export const LINK_GRID_COLUMNS =
  "grid-cols-[repeat(2,minmax(0,210px))] justify-center gap-x-4 sm:grid-cols-[repeat(3,minmax(0,210px))] md:gap-x-10 lg:grid-cols-[repeat(4,minmax(0,210px))]";

/** A page frame wide enough for four cards and their gaps (4×210 + 3×40). */
export const LINK_GRID_FRAME = "mx-auto w-full max-w-[960px]";

/**
 * The landing demo's grid: `LINK_GRID_COLUMNS` stopping at three columns,
 * which suit the narrower product panel.
 */
export const DEMO_GRID_COLUMNS =
  "grid-cols-[repeat(2,minmax(0,210px))] justify-center gap-x-4 sm:grid-cols-[repeat(3,minmax(0,210px))] md:gap-x-10";

/** A frame for three cards and their gaps (3×210 + 2×40). */
export const DEMO_GRID_FRAME = "mx-auto w-full max-w-[710px]";
