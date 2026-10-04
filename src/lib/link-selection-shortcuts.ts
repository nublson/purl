/** What a key press does while links are selected (see `matchSelectionShortcut`). */
export type SelectionShortcut = "clear" | "selectAll" | "delete" | "move" | "read";

type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/**
 * The selection bar's shortcuts, active only while links are selected:
 * Esc clears, ⌘A / Ctrl+A selects all, Delete or Backspace deletes, M opens
 * Move, R marks read (or unread, when all are read). Returns null for any other key (and for M/Delete with modifiers, so
 * browser and OS shortcuts keep working).
 */
export function matchSelectionShortcut(
  event: KeyEventLike,
  { apple }: { apple: boolean },
): SelectionShortcut | null {
  const mod = apple ? event.metaKey : event.ctrlKey;
  const anyModifier =
    event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
  if (event.key === "Escape") return "clear";
  if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a") {
    return "selectAll";
  }
  if (anyModifier) return null;
  if (event.key === "Delete" || event.key === "Backspace") return "delete";
  if (event.key.toLowerCase() === "m") return "move";
  if (event.key.toLowerCase() === "r") return "read";
  return null;
}

/** How each shortcut is shown in tooltips (`Kbd`). */
export function selectionShortcutLabel(
  shortcut: SelectionShortcut,
  { apple }: { apple: boolean },
): string {
  switch (shortcut) {
    case "clear":
      return "Esc";
    case "selectAll":
      return apple ? "⌘A" : "Ctrl+A";
    case "delete":
      // "Del", as keyboards print it: "Delete" would repeat the tooltip's label.
      return apple ? "⌫" : "Del";
    case "move":
      return "M";
    case "read":
      return "R";
  }
}
