/** The `U` shortcut that opens the file picker (Home and folder pages). */
export const UPLOAD_SHORTCUT = "U";

/** Toasted when files (or the picker) found no page to take them. */
export const NO_UPLOAD_PAGE_MESSAGE = "Open Home or a folder to upload";

/** Toasted when files are dropped or pasted without a Blob store. */
export const UPLOADS_UNAVAILABLE_MESSAGE = "Uploads aren't available here";

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
