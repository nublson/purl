import { describe, expect, it } from "vitest";
import { detectImportFormat } from "./detect-format";

describe("detectImportFormat", () => {
  it("detects a bookmarks HTML export by its doctype", () => {
    expect(
      detectImportFormat("<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>"),
    ).toBe("bookmarks-html");
  });

  it("detects bookmarks HTML without a doctype by its first link", () => {
    expect(
      detectImportFormat('<DL><p><DT><A HREF="https://example.com">A</A>'),
    ).toBe("bookmarks-html");
  });

  it("only looks at the first 2 KB for HTML markers", () => {
    expect(detectImportFormat(`${" ".repeat(2100)}netscape-bookmark-file`)).toBeNull();
  });

  it("detects a full Raindrop backup", () => {
    const csv =
      "id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite\n1,A,,,https://example.com,Dev,,2024-01-01T00:00:00Z,,,false";
    expect(detectImportFormat(csv)).toBe("raindrop-csv");
  });

  it("detects a Raindrop CSV even when a title or note mentions the HTML marker", () => {
    const csv =
      "id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite\n1,About netscape-bookmark-file,<dt><a href,,https://example.com,Dev,,2024-01-01T00:00:00Z,,,false";
    expect(detectImportFormat(csv)).toBe("raindrop-csv");
  });

  it("detects a Pocket CSV even when a title mentions the HTML marker", () => {
    const csv =
      "title,url,time_added,tags,status\nNetscape-Bookmark-File format,https://example.com,1700000000,,unread";
    expect(detectImportFormat(csv)).toBe("pocket-csv");
  });

  it("detects a single-collection Raindrop export (no folder column)", () => {
    const csv =
      "id,title,note,excerpt,url,tags,created,cover,highlights,favorite\n1,A,,,https://example.com,,2024-01-01T00:00:00Z,,,false";
    expect(detectImportFormat(csv)).toBe("raindrop-csv");
  });

  it("detects Pocket CSV", () => {
    expect(
      detectImportFormat(
        "title,url,time_added,tags,status\nA,https://example.com,1700000000,,unread",
      ),
    ).toBe("pocket-csv");
  });

  it("ignores a BOM, header case and CRLF", () => {
    expect(
      detectImportFormat("﻿Title,URL,Time_Added\r\nA,https://example.com,1"),
    ).toBe("pocket-csv");
  });

  it("returns null for other text, JSON and an empty string", () => {
    expect(detectImportFormat("Just some notes about links.")).toBeNull();
    expect(detectImportFormat('{"url":"https://example.com"}')).toBeNull();
    expect(detectImportFormat("")).toBeNull();
    expect(detectImportFormat("url,title\nhttps://example.com,A")).toBeNull();
  });
});
