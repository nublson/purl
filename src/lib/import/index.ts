import { detectImportFormat } from "./detect-format";
import { cleanImportItems } from "./normalize";
import { parseBookmarksHtml } from "./parse-bookmarks-html";
import { parsePocketCsv } from "./parse-pocket-csv";
import { parseRaindropCsv } from "./parse-raindrop-csv";
import type { ImportFormat, ImportItem } from "./types";

export type ParseImportResult =
  | {
      ok: true;
      format: ImportFormat;
      items: ImportItem[];
      skipped: number;
      folders: { name: string; count: number }[];
    }
  | { ok: false; reason: "unrecognized" | "empty" };

const PARSERS: Record<ImportFormat, (text: string) => ImportItem[]> = {
  "bookmarks-html": parseBookmarksHtml,
  "raindrop-csv": parseRaindropCsv,
  "pocket-csv": parsePocketCsv,
};

/** Folder names with their link counts, grouped case-insensitively (first spelling wins). */
function groupFolders(items: ImportItem[]): { name: string; count: number }[] {
  const groups = new Map<string, { name: string; count: number }>();
  for (const { folder } of items) {
    if (!folder) continue;
    const key = folder.trim().toLowerCase();
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { name: folder.trim(), count: 1 });
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

/** Detects, reads and cleans an import file's text. */
export function parseImportFile(text: string, now?: Date): ParseImportResult {
  const format = detectImportFormat(text);
  if (!format) return { ok: false, reason: "unrecognized" };
  const { items, skipped } = cleanImportItems(PARSERS[format](text), now);
  if (items.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, format, items, skipped, folders: groupFolders(items) };
}
