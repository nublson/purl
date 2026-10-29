/**
 * What a drop on the page carries. Pure, so it's tested without a browser:
 * the drop handler passes the event's `DataTransfer`.
 */

/** The parts of a `DataTransfer` this reads. */
export type DropTransfer<F extends { type: string; size: number }> = {
  /** An array in today's browsers; a `DOMStringList` in older ones. */
  types: ArrayLike<string>;
  files: ArrayLike<F>;
  getData(format: string): string;
};

export type DropContent<F> =
  /** Files to upload, in drop order; `folders` were dropped beside them. */
  | { files: F[]; folders: number }
  /** Only folders: nothing to upload. */
  | { folder: true }
  /** A dragged link or text: saved like a paste. */
  | { text: string };

/** Whether a drag carries files (the overlay shows only for these). */
export function draggingFiles(
  transfer: Pick<DropTransfer<{ type: string; size: number }>, "types"> | null | undefined,
): boolean {
  return !!transfer && Array.from(transfer.types).includes("Files");
}

/**
 * A folder dragged from the desktop arrives as an entry with no type and no
 * size (a file always has one or the other).
 */
function isFolderEntry(file: { type: string; size: number }): boolean {
  return file.type === "" && file.size === 0;
}

/** The URLs of a `text/uri-list`, one per line, without its `#` comments. */
function uriListText(list: string): string {
  return list
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join("\n");
}

/**
 * Files first (a browser puts the file's name beside them as text), then a
 * dragged link's URL list, then plain text. Null when nothing is usable.
 */
export function classifyDrop<F extends { type: string; size: number }>(
  transfer: DropTransfer<F> | null | undefined,
): DropContent<F> | null {
  if (!transfer) return null;

  const entries = Array.from(transfer.files);
  if (entries.length > 0) {
    const files = entries.filter((file) => !isFolderEntry(file));
    if (files.length === 0) return { folder: true };
    return { files, folders: entries.length - files.length };
  }

  const types = Array.from(transfer.types);
  if (types.includes("text/uri-list")) {
    const urls = uriListText(transfer.getData("text/uri-list"));
    if (urls) return { text: urls };
  }
  const text = types.includes("text/plain")
    ? transfer.getData("text/plain").trim()
    : "";
  return text ? { text } : null;
}
