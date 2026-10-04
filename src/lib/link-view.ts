/**
 * How the owner's lists (Home, folders) show links: rows, or a grid of
 * cards. Saved on the account (`User.linkView`), changed from the user
 * menu. The shared folder page has its own, per visitor
 * (`shared-folder-view.ts`).
 */
export type LinkView = "list" | "grid";

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
 * A grid of link cards: 2 / 3 / 4 columns (phone / md / lg) of cards up
 * to 210px, centered, 16px gutters widening to 40px from md. Shared by
 * the owner's grid, the shared folder's, their skeletons and anything
 * lined up with them.
 */
export const LINK_GRID_COLUMNS =
  "grid-cols-[repeat(2,minmax(0,210px))] justify-center gap-x-4 md:grid-cols-[repeat(3,minmax(0,210px))] md:gap-x-10 lg:grid-cols-[repeat(4,minmax(0,210px))]";

/** A page frame wide enough for four cards and their gaps (4×210 + 3×40). */
export const LINK_GRID_FRAME = "mx-auto w-full max-w-[960px]";
