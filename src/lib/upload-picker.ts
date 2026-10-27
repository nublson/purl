/** The `U` shortcut that opens the file picker (Home and folder pages). */
export const UPLOAD_SHORTCUT = "U";

/** Window event the + menu's "Upload files" sends to the page's `UploadInput`. */
export const UPLOAD_PICK_EVENT = "purl:upload-pick";

/** Toasted when files (or the picker) found no page to take them. */
export const NO_UPLOAD_PAGE_MESSAGE = "Open Home or a folder to upload";

/**
 * Opens the page's file picker (`UploadInput`, rendered by `HomeShell`).
 * Returns false when no page took it (the picker isn't mounted).
 */
export function openUploadPicker(): boolean {
  return !window.dispatchEvent(new Event(UPLOAD_PICK_EVENT, { cancelable: true }));
}

/**
 * A plain `U` keypress: not already handled, not held down, no modifiers.
 * The caller still checks the target (typing) and open overlays, like `A`.
 */
export function isUploadShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "defaultPrevented" | "repeat" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
  >,
): boolean {
  if (event.defaultPrevented || event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  return event.key.toLowerCase() === UPLOAD_SHORTCUT.toLowerCase();
}
