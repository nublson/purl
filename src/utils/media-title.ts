/** Longest title a link keeps (the same cut every scraped title gets). */
const MAX_TITLE_LENGTH = 500;

/**
 * Control characters other than whitespace (which collapses to a space): a
 * NUL would fail the row's insert, and none of them belong in a title.
 */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000e-\u001f\u007f]/g;

/** A file name without its extension, control characters dropped, whitespace collapsed, cut to 500; "" when nothing is left. */
function baseName(name: string): string {
  return name
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\.[a-z0-9]+\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
}

/** Title for a file by its name: "My Shot.png" → "My Shot"; "file" when nothing is left. */
export function titleFromFileName(name: string): string {
  return baseName(name) || "file";
}

/**
 * Title for a media URL (an image, video or audio file): its last path
 * segment, percent-decoded, without its extension; `domain` when the path
 * names no file.
 */
export function mediaTitleFromUrl(url: string, domain: string): string {
  let segment = "";
  try {
    segment = new URL(url).pathname.split("/").pop() ?? "";
  } catch {
    return domain;
  }
  try {
    segment = decodeURIComponent(segment);
  } catch {
    // A malformed escape: keep the segment as written.
  }
  return baseName(segment) || domain;
}
