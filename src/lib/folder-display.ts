/**
 * Client-safe folder display constants and copy helpers (no server imports),
 * shared by the folder UI and `src/lib/folders.ts`.
 */

/** Emoji shown for a folder that has none stored (the oyster — home of a pearl). */
export const DEFAULT_FOLDER_EMOJI = "🦪";

/** Max length (in characters) of a folder description; enforced by `src/lib/folders.ts`. */
export const MAX_FOLDER_DESCRIPTION_LENGTH = 160;

/** "1 link", "0 links", "3 links". */
export function formatLinkCount(count: number): string {
  return `${count} ${count === 1 ? "link" : "links"}`;
}
