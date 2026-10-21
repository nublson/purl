import { readCsvTable } from "./csv-table";
import { flattenFolderPath } from "./normalize";
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
  const table = readCsvTable(text);
  if (!table) return [];
  return table.rows.map((row) => ({
    url: table.cell(row, "url").trim(),
    title: table.cell(row, "title"),
    folder: parseFolder(table.cell(row, "folder")),
    createdAt: parseCreated(table.cell(row, "created")),
  }));
}
