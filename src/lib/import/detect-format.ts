import { parseCsv } from "./parse-csv";
import type { ImportFormat } from "./types";

const HTML_SNIFF_LENGTH = 2048;

function csvHeader(text: string): Set<string> {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const [header = []] = parseCsv(firstLine);
  return new Set(header.map((name) => name.trim().toLowerCase()));
}

/** Tells which export a file is from by looking inside it, never at its name. */
export function detectImportFormat(text: string): ImportFormat | null {
  const head = text.slice(0, HTML_SNIFF_LENGTH).toLowerCase();
  if (head.includes("netscape-bookmark-file") || head.includes("<dt><a href")) {
    return "bookmarks-html";
  }
  const header = csvHeader(text);
  if (
    header.has("url") &&
    header.has("title") &&
    header.has("created") &&
    (header.has("folder") || header.has("excerpt"))
  ) {
    return "raindrop-csv";
  }
  if (header.has("title") && header.has("url") && header.has("time_added")) {
    return "pocket-csv";
  }
  return null;
}
