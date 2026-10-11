import { flattenFolderPath } from "./normalize";
import { parseCsv } from "./parse-csv";
import type { ImportItem } from "./types";

const FOLDER_SEPARATOR = " / ";
const UNSORTED = "unsorted";

function parseCreated(value: string): Date | null {
  if (value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseFolder(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toLowerCase() === UNSORTED) return null;
  return flattenFolderPath(trimmed.split(FOLDER_SEPARATOR));
}

/**
 * Reads a Raindrop.io CSV export. A single-collection export has no `folder`
 * column, so its items are unfiled. Output is unvalidated (see `cleanImportItems`).
 */
export function parseRaindropCsv(text: string): ImportItem[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const names = header.map((h) => h.trim().toLowerCase());
  const urlAt = names.indexOf("url");
  if (urlAt === -1) return [];
  const titleAt = names.indexOf("title");
  const folderAt = names.indexOf("folder");
  const createdAt = names.indexOf("created");

  const cell = (row: string[], index: number) =>
    index === -1 ? "" : (row[index] ?? "");

  const items: ImportItem[] = [];
  for (const row of rows) {
    const url = cell(row, urlAt).trim();
    if (url === "") continue;
    items.push({
      url,
      title: cell(row, titleAt),
      folder: parseFolder(cell(row, folderAt)),
      createdAt: parseCreated(cell(row, createdAt)),
    });
  }
  return items;
}
