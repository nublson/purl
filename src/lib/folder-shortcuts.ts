/** The key for Home, the folder menu's first row. */
export const HOME_SHORTCUT = "1";

/**
 * Keys for the folders after Home, in number-row order: 2–9, then 0 (it
 * comes after 9 on a keyboard). The rest are reached through the menu.
 */
const FOLDER_KEYS = ["2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

/** How many folders get a key. */
export const MAX_FOLDER_SHORTCUTS = FOLDER_KEYS.length;

/**
 * The key for the folder at `index` in the folder menu (0-based, after
 * Home): "2" for the first, up to "9", then "0"; null past the ninth.
 */
export function folderShortcutKey(index: number): string | null {
  return FOLDER_KEYS[index] ?? null;
}

type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/**
 * Where a key press goes: `"home"` for 1, a folder for 2–9 and 0 (by its
 * place in `folders`, the menu's order), null for anything else, for a key
 * with no folder, and for any modifier (⌘1 and Ctrl+1 switch browser tabs).
 */
export function matchFolderShortcut<T>(
  event: KeyEventLike,
  folders: readonly T[],
): "home" | T | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return null;
  }
  if (event.key === HOME_SHORTCUT) return "home";
  const index = (FOLDER_KEYS as readonly string[]).indexOf(event.key);
  return index === -1 ? null : (folders[index] ?? null);
}
