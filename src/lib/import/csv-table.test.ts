import { describe, expect, it } from "vitest";
import { readCsvTable } from "./csv-table";

describe("readCsvTable", () => {
  it("returns null when there is no header row", () => {
    expect(readCsvTable("")).toBeNull();
    expect(readCsvTable("\n")).toBeNull();
  });

  it("returns null when the header has no url column", () => {
    expect(readCsvTable("title,note\nA,hello")).toBeNull();
  });

  it("finds columns case-insensitively and drops rows without a url", () => {
    const table = readCsvTable("Title,URL\nA,https://example.com/a\nB,\n,https://example.com/c");
    expect(table).not.toBeNull();
    expect(table!.rows).toHaveLength(2);
    expect(table!.cell(table!.rows[0], "title")).toBe("A");
    expect(table!.cell(table!.rows[0], "url")).toBe("https://example.com/a");
    expect(table!.cell(table!.rows[1], "url")).toBe("https://example.com/c");
    expect(table!.cell(table!.rows[0], "missing")).toBe("");
  });

  it("treats a url of only whitespace as empty and drops the row", () => {
    const table = readCsvTable("url,title\n   ,Ghost\nhttps://example.com/a,A");
    expect(table!.rows).toHaveLength(1);
    expect(table!.cell(table!.rows[0], "title")).toBe("A");
  });

  it("keeps a quoted title with a comma in the row cells", () => {
    const table = readCsvTable('url,title\nhttps://example.com/a,"Hello, world"');
    expect(table!.cell(table!.rows[0], "title")).toBe("Hello, world");
  });
});
