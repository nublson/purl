/** Folders 1–9 get a digit key; the rest are reached through the menu. */
export const MAX_FOLDER_SHORTCUTS = 9;

/** The key for Home in the folder menu (it sits above folder 1). */
export const HOME_SHORTCUT = "0";

/**
 * The digit for the folder at `index` in the folder menu (0-based): "1" for
 * the first, up to "9"; null past the ninth.
 */
export function folderShortcutKey(index: number): string | null {
  return index >= 0 && index < MAX_FOLDER_SHORTCUTS ? String(index + 1) : null;
}

type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/**
 * Where a key press goes: `"home"` for 0, the folder for 1–9 (by its place
 * in `folders`, the menu's order), null for anything else, for a digit with
 * no folder, and for any modifier (⌘1 and Ctrl+1 switch browser tabs).
 */
export function matchFolderShortcut<T>(
  event: KeyEventLike,
  folders: readonly T[],
): "home" | T | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return null;
  }
  if (event.key === HOME_SHORTCUT) return "home";
  if (!/^[1-9]$/.test(event.key)) return null;
  return folders[Number(event.key) - 1] ?? null;
}
