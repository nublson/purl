/**
 * Client-safe folder display constants and copy helpers (no server imports),
 * shared by the folder UI and `src/lib/folders.ts`.
 */

/** Emoji shown for a folder that has none stored (the oyster — home of a pearl). */
export const DEFAULT_FOLDER_EMOJI = "🦪";

/** Max length (in characters) of a folder description; enforced by `src/lib/folders.ts`. */
export const MAX_FOLDER_DESCRIPTION_LENGTH = 160;

/** How a folder is named in copy such as toasts: its emoji, then its name ("🦪 Reading"). */
export function formatFolderLabel(folder: { emoji: string; name: string }): string {
  return `${folder.emoji} ${folder.name}`;
}

/** "1 link", "0 links", "3 links". */
export function formatLinkCount(count: number): string {
  return `${count} ${count === 1 ? "link" : "links"}`;
}

/**
 * Toast copy for a bulk move of `count` links: "Moved 3 links to 🦪 Reading"
 * into `target`; with no target (taken out of their folders), "Removed 3
 * links from 🦪 Reading" when they all left `source`, else "Removed 3 links
 * from their folders".
 */
export function formatBulkMoveMessage({
  count,
  target,
  source,
}: {
  count: number;
  target: { emoji: string; name: string } | null;
  source: { emoji: string; name: string } | null;
}): string {
  const links = formatLinkCount(count);
  if (target) return `Moved ${links} to ${formatFolderLabel(target)}`;
  if (source) return `Removed ${links} from ${formatFolderLabel(source)}`;
  return `Removed ${links} from their folders`;
}
