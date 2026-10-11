import { linkUrlKey } from "@/lib/link-url-key";
import { MAX_FOLDER_NAME_LENGTH } from "@/lib/limits";
import type { ImportItem } from "./types";

const FOLDER_SEPARATOR = " / ";
const ELLIPSIS = "…";
const EARLIEST_DATE = new Date("2000-01-01T00:00:00Z");

/** Cuts a name to `MAX_FOLDER_NAME_LENGTH` UTF-16 units, by code points, ending in `…`. */
export function truncateFolderName(name: string): string {
  if (name.length <= MAX_FOLDER_NAME_LENGTH) return name;
  const budget = MAX_FOLDER_NAME_LENGTH - ELLIPSIS.length;
  let out = "";
  for (const point of name) {
    if (out.length + point.length > budget) break;
    out += point;
  }
  return out.trimEnd() + ELLIPSIS;
}

/**
 * Turns a bookmark folder path into one folder name: "Dev / Tools". A path too
 * long for a folder name falls back to its last segment. `null` when empty.
 */
export function flattenFolderPath(segments: string[]): string | null {
  const parts = segments.map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) return null;
  const joined = parts.join(FOLDER_SEPARATOR);
  if (joined.length <= MAX_FOLDER_NAME_LENGTH) return joined;
  return truncateFolderName(parts[parts.length - 1]);
}

function isWebUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Drops non-web and unparseable URLs and in-file duplicates, trims titles,
 * nulls implausible dates and sorts newest first (undated items count as
 * `now`; ties keep file order). `skipped` counts only the dropped non-web or
 * unparseable URLs; in-file duplicates collapse silently.
 */
export function cleanImportItems(
  items: ImportItem[],
  now: Date = new Date(),
): { items: ImportItem[]; skipped: number } {
  const valid: ImportItem[] = [];
  let skipped = 0;
  for (const item of items) {
    const url = item.url.trim();
    if (!isWebUrl(url)) {
      skipped++;
      continue;
    }
    const date = item.createdAt;
    const plausible =
      date !== null &&
      !Number.isNaN(date.getTime()) &&
      date >= EARLIEST_DATE &&
      date <= now;
    valid.push({
      ...item,
      url,
      title: item.title.trim(),
      createdAt: plausible ? date : null,
    });
  }

  const time = (item: ImportItem) => (item.createdAt ?? now).getTime();
  // Array#sort is stable, so equal times keep file order.
  valid.sort((a, b) => time(b) - time(a));

  const seen = new Set<string>();
  const unique: ImportItem[] = [];
  for (const item of valid) {
    const key = linkUrlKey(item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return { items: unique, skipped };
}
