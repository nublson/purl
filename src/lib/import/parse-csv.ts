/** Reads RFC 4180 CSV: quoted fields may hold commas, line breaks and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // True once the current row has any content, so a trailing newline adds no row.
  let rowStarted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      rowStarted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      rowStarted = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      rowStarted = false;
    } else {
      field += ch;
      rowStarted = true;
    }
  }
  if (rowStarted) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
