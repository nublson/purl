import { LINK_GRID_COLUMNS } from "@/lib/link-view";

/**
 * A shared folder page's layout: rows or a grid of cards. A visitor first
 * sees the owner's view for that folder (its own, else the owner's account
 * view: `resolvePublicFolder`'s `view`); switching remembers their choice for
 * that folder only.
 */
export type SharedFolderView = "list" | "grid";

/**
 * Each visitor's choices, per folder: a cookie (not localStorage) so the
 * server renders the chosen view, no list-to-grid flash on reload. Entries
 * `<folderId>:l` / `<folderId>:g`, joined by `.`, newest first.
 */
export const SHARED_VIEWS_COOKIE = "purl-shared-views";

/** The one-choice-for-every-folder cookie this replaced; cleared on write. */
export const LEGACY_SHARED_VIEW_COOKIE = "purl-shared-view";

/** Folders remembered at most (about 1.4 KB of cookie). */
export const MAX_VISITOR_VIEWS = 50;

type Entry = { folderId: string; view: SharedFolderView };

const LETTER_TO_VIEW: Record<string, SharedFolderView> = { l: "list", g: "grid" };

/** The cookie's valid entries, in order, one per folder (the first wins). */
function parseEntries(cookie: string | undefined | null): Entry[] {
  if (!cookie) return [];
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const part of cookie.split(".")) {
    const at = part.lastIndexOf(":");
    if (at <= 0) continue;
    const folderId = part.slice(0, at);
    const view = LETTER_TO_VIEW[part.slice(at + 1)];
    if (!view || seen.has(folderId)) continue;
    seen.add(folderId);
    entries.push({ folderId, view });
  }
  return entries;
}

/** The visitor's choice for one folder, or null when they never switched it. */
export function readVisitorView(
  cookie: string | undefined | null,
  folderId: string,
): SharedFolderView | null {
  return parseEntries(cookie).find((entry) => entry.folderId === folderId)?.view ?? null;
}

/**
 * The cookie's value after the visitor picks `view` for a folder: the choice
 * first, unless it's the owner's view (then it's forgotten, so a later
 * change by the owner reaches them), at most `MAX_VISITOR_VIEWS` entries.
 */
export function withVisitorView(
  cookie: string | undefined | null,
  folderId: string,
  view: SharedFolderView,
  ownerView: SharedFolderView,
): string {
  const rest = parseEntries(cookie).filter((entry) => entry.folderId !== folderId);
  const entries = view === ownerView ? rest : [{ folderId, view }, ...rest];
  return entries
    .slice(0, MAX_VISITOR_VIEWS)
    .map((entry) => `${entry.folderId}:${entry.view === "list" ? "l" : "g"}`)
    .join(".");
}

/** The view a shared folder opens in: the visitor's choice, else the owner's. */
export function initialSharedView(
  cookie: string | undefined | null,
  folderId: string,
  ownerView: SharedFolderView,
): SharedFolderView {
  return readVisitorView(cookie, folderId) ?? ownerView;
}

/** The shared folder grid: the same columns as the owner's (`link-view.ts`). */
export const SHARED_GRID_COLUMNS = LINK_GRID_COLUMNS;
