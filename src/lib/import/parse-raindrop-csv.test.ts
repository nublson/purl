import { describe, expect, it } from "vitest";
import { parseRaindropCsv } from "./parse-raindrop-csv";

const FULL_HEADER =
  "id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite";

function row(
  title: string,
  url: string,
  folder: string,
  created: string,
): string {
  return `1,${title},,,${url},${folder},,${created},,,false`;
}

describe("parseRaindropCsv", () => {
  it("reads title, url, nested folder and created date", () => {
    const csv = [
      FULL_HEADER,
      row("Example", "https://example.com/a", "Design Engineer / Artists", "2026-10-11T17:40:26.872Z"),
    ].join("\n");
    expect(parseRaindropCsv(csv)).toEqual([
      {
        url: "https://example.com/a",
        title: "Example",
        folder: "Design Engineer / Artists",
        createdAt: new Date("2026-10-11T17:40:26.872Z"),
      },
    ]);
  });

  it("maps Unsorted (any case) and empty folders to null", () => {
    const csv = [
      FULL_HEADER,
      row("A", "https://example.com/a", "Unsorted", ""),
      row("B", "https://example.com/b", "UNSORTED", ""),
      row("C", "https://example.com/c", "", ""),
    ].join("\n");
    expect(parseRaindropCsv(csv).map((i) => i.folder)).toEqual([null, null, null]);
  });

  it("keeps a quoted title with a comma", () => {
    const csv = [
      FULL_HEADER,
      row('"Hello, world"', "https://example.com/a", "Reading", ""),
    ].join("\n");
    expect(parseRaindropCsv(csv)[0].title).toBe("Hello, world");
  });

  it("nulls a garbage or empty created date", () => {
    const csv = [
      FULL_HEADER,
      row("A", "https://example.com/a", "", "garbage"),
      row("B", "https://example.com/b", "", ""),
    ].join("\n");
    expect(parseRaindropCsv(csv).map((i) => i.createdAt)).toEqual([null, null]);
  });

  it("finds columns case-insensitively", () => {
    const csv = [
      "ID,Title,Note,Excerpt,URL,Folder,Tags,Created,Cover,Highlights,Favorite",
      row("A", "https://example.com/a", "Reading", "2026-10-11T17:40:26.872Z"),
    ].join("\n");
    const [item] = parseRaindropCsv(csv);
    expect(item.url).toBe("https://example.com/a");
    expect(item.folder).toBe("Reading");
  });

  it("gives every item a null folder when the export has no folder column", () => {
    const csv = [
      "id,title,note,excerpt,url,tags,created,cover,highlights,favorite",
      "1,A,,,https://example.com/a,,2026-10-11T17:40:26.872Z,,,false",
    ].join("\n");
    expect(parseRaindropCsv(csv)).toEqual([
      {
        url: "https://example.com/a",
        title: "A",
        folder: null,
        createdAt: new Date("2026-10-11T17:40:26.872Z"),
      },
    ]);
  });

  it("ignores a leading BOM", () => {
    const csv = "\uFEFFurl,title\nhttps://example.com/a,A";
    expect(parseRaindropCsv(csv)).toEqual([
      { url: "https://example.com/a", title: "A", folder: null, createdAt: null },
    ]);
  });

  it("falls back to the last segment for a folder over 60 characters", () => {
    const long = `${"a".repeat(40)} / ${"b".repeat(40)} / Leaf`;
    const csv = [FULL_HEADER, row("A", "https://example.com/a", long, "")].join("\n");
    expect(parseRaindropCsv(csv)[0].folder).toBe("Leaf");
  });

  it("skips rows without a url", () => {
    const csv = [FULL_HEADER, row("A", "", "Reading", "")].join("\n");
    expect(parseRaindropCsv(csv)).toEqual([]);
  });

  it("returns nothing for a file without a url column", () => {
    expect(parseRaindropCsv("title,note\nA,b")).toEqual([]);
  });
});
