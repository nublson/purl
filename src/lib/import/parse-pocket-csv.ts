import { readCsvTable } from "./csv-table";
import type { ImportItem } from "./types";

/** Pocket's `time_added` is Unix seconds; anything else (or out of range) is no date. */
function parseTimeAdded(value: string): Date | null {
  const seconds = Number(value.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Reads a Pocket CSV export (`title,url,time_added,tags,status`). Output is unvalidated. */
export function parsePocketCsv(text: string): ImportItem[] {
  const table = readCsvTable(text);
  if (!table) return [];
  return table.rows.map((row) => ({
    url: table.cell(row, "url").trim(),
    title: table.cell(row, "title"),
    folder: null,
    createdAt: parseTimeAdded(table.cell(row, "time_added")),
  }));
}
