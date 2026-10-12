import { parseCsv } from "./parse-csv";

export type CsvTable = {
  /** Data rows that have a `url` cell. */
  rows: string[][];
  /** The cell of a named column (lower-case) in a row; "" when the column or cell is missing. */
  cell: (row: string[], column: string) => string;
};

/**
 * Reads a bookmark CSV: columns are found by lower-cased header name and rows
 * without a `url` are dropped. `null` when there is no header or no `url` column.
 */
export function readCsvTable(text: string): CsvTable | null {
  const [header, ...all] = parseCsv(text);
  if (!header) return null;
  const names = header.map((h) => h.trim().toLowerCase());
  const urlAt = names.indexOf("url");
  if (urlAt === -1) return null;
  return {
    rows: all.filter((row) => (row[urlAt] ?? "").trim() !== ""),
    cell: (row, column) => {
      const at = names.indexOf(column);
      return at === -1 ? "" : (row[at] ?? "");
    },
  };
}
