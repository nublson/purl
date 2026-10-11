import { parseCsv } from "./parse-csv";
import type { ImportItem } from "./types";

/** Pocket's `time_added` is Unix seconds; anything else is no date. */
function parseTimeAdded(value: string): Date | null {
  const seconds = Number(value.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

/** Reads a Pocket CSV export (`title,url,time_added,tags,status`). Output is unvalidated. */
export function parsePocketCsv(text: string): ImportItem[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const names = header.map((h) => h.trim().toLowerCase());
  const urlAt = names.indexOf("url");
  if (urlAt === -1) return [];
  const titleAt = names.indexOf("title");
  const addedAt = names.indexOf("time_added");

  const cell = (row: string[], index: number) =>
    index === -1 ? "" : (row[index] ?? "");

  const items: ImportItem[] = [];
  for (const row of rows) {
    const url = cell(row, urlAt).trim();
    if (url === "") continue;
    items.push({
      url,
      title: cell(row, titleAt),
      folder: null,
      createdAt: parseTimeAdded(cell(row, addedAt)),
    });
  }
  return items;
}
