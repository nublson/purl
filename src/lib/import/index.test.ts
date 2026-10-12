import { describe, expect, it } from "vitest";
import { parseImportFile } from "./index";

const HEADER =
  "id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite";
const NOW = new Date("2025-01-01T00:00:00Z");

describe("parseImportFile", () => {
  it("parses, cleans and groups folders case-insensitively", () => {
    const csv = [
      HEADER,
      "1,Old,,,https://example.com/a,Dev,,2023-01-01T00:00:00Z,,,false",
      "2,New,,,https://example.com/b, dev ,,2024-06-01T00:00:00Z,,,false",
      "3,Other,,,https://example.com/c,Cooking,,2024-01-01T00:00:00Z,,,false",
      "4,Bad,,,ftp://example.com/d,Cooking,,2024-01-01T00:00:00Z,,,false",
      "5,Cook2,,,https://example.com/e,Cooking,,2024-02-01T00:00:00Z,,,false",
    ].join("\n");
    const result = parseImportFile(csv, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("raindrop-csv");
    expect(result.items.map((i) => i.url)).toEqual([
      "https://example.com/b",
      "https://example.com/e",
      "https://example.com/c",
      "https://example.com/a",
    ]);
    expect(result.skipped).toBe(1);
    expect(result.folders).toEqual([
      { name: "Cooking", count: 2 },
      { name: "dev", count: 2 },
    ]);
  });

  it("uses the spelling of the first folder in the cleaned (newest-first) order", () => {
    const csv = [
      HEADER,
      "1,A,,,https://example.com/a,dev,,2024-02-01T00:00:00Z,,,false",
      "2,B,,,https://example.com/b,DEV,,2024-01-01T00:00:00Z,,,false",
    ].join("\n");
    const result = parseImportFile(csv, NOW);
    expect(result.ok && result.folders).toEqual([{ name: "dev", count: 2 }]);
  });

  it("parses Pocket CSV and bookmarks HTML", () => {
    const pocket = parseImportFile(
      "title,url,time_added,tags,status\nA,https://example.com/a,1700000000,,unread",
      NOW,
    );
    expect(pocket.ok && pocket.format).toBe("pocket-csv");
    const html = parseImportFile(
      '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><A HREF="https://example.com/a" ADD_DATE="1700000000">A</A></DL>',
      NOW,
    );
    expect(html.ok && html.format).toBe("bookmarks-html");
    expect(html.ok && html.items).toHaveLength(1);
  });

  it("reports unrecognized text", () => {
    expect(parseImportFile("hello there", NOW)).toEqual({
      ok: false,
      reason: "unrecognized",
    });
  });

  it("reports empty for a header with no rows or only non-web URLs", () => {
    expect(parseImportFile(HEADER, NOW)).toEqual({ ok: false, reason: "empty" });
    expect(
      parseImportFile(
        `${HEADER}\n1,A,,,ftp://example.com/a,,,2024-01-01T00:00:00Z,,,false`,
        NOW,
      ),
    ).toEqual({ ok: false, reason: "empty" });
  });

  it("leaves unfiled items out of the folder list", () => {
    const result = parseImportFile(
      "title,url,time_added\nA,https://example.com/a,1700000000",
      NOW,
    );
    expect(result.ok && result.folders).toEqual([]);
  });
});
