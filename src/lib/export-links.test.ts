import { describe, expect, it } from "vitest";
import { buildBookmarksHtml, exportFileName, ROOT_FOLDER_NAME } from "./export-links";
import { parseBookmarksHtml } from "./import/parse-bookmarks-html";

const at = (iso: string) => new Date(iso);

describe("buildBookmarksHtml", () => {
  it("writes folders in order, with their links newest first, and unfiled links at the top level", () => {
    const html = buildBookmarksHtml({
      folders: [
        { id: "f1", name: "Reading", createdAt: at("2026-01-01T00:00:00Z") },
        { id: "f2", name: "Dev", createdAt: at("2026-01-02T00:00:00Z") },
      ],
      links: [
        { url: "https://a.test/new", title: "New", description: null, folderId: "f1", createdAt: at("2026-03-01T00:00:00Z") },
        { url: "https://a.test/old", title: "Old", description: null, folderId: "f1", createdAt: at("2026-02-01T00:00:00Z") },
        { url: "https://a.test/dev", title: "Dev link", description: null, folderId: "f2", createdAt: at("2026-02-15T00:00:00Z") },
        { url: "https://a.test/home", title: "Home link", description: null, folderId: null, createdAt: at("2026-02-20T00:00:00Z") },
      ],
    });

    expect(html.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBe(true);
    const order = ["Reading", "/new", "/old", "Dev", "/dev", "/home"].map((s) => html.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(html).toContain('<DT><H3 ADD_DATE="1767225600">Reading</H3>');
    expect(html).toContain('<DT><A HREF="https://a.test/new" ADD_DATE="1772323200">New</A>');
  });

  it("escapes names, titles, URLs and descriptions", () => {
    const html = buildBookmarksHtml({
      folders: [{ id: "f", name: 'Tom & "Jerry" <3', createdAt: at("2026-01-01T00:00:00Z") }],
      links: [
        {
          url: "https://a.test/?a=1&b=<2>",
          title: "A <b>bold</b> & \"quoted\" title",
          description: "Line one\nline <two> & three",
          folderId: "f",
          createdAt: at("2026-01-01T00:00:00Z"),
        },
      ],
    });
    expect(html).toContain("<H3 ADD_DATE=\"1767225600\">Tom &amp; &quot;Jerry&quot; &lt;3</H3>");
    expect(html).toContain('HREF="https://a.test/?a=1&amp;b=&lt;2&gt;"');
    expect(html).toContain(">A &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; title</A>");
    expect(html).toContain("<DD>Line one line &lt;two&gt; &amp; three");
    expect(html).not.toContain("<b>");
  });

  it("writes no DD for a link without a description and skips empty folders' links list gracefully", () => {
    const html = buildBookmarksHtml({
      folders: [{ id: "f", name: "Empty", createdAt: at("2026-01-01T00:00:00Z") }],
      links: [{ url: "https://a.test/", title: "Root", description: "", folderId: null, createdAt: at("2026-01-01T00:00:00Z") }],
    });
    expect(html).not.toContain("<DD>");
    expect(html).toContain("<H3 ADD_DATE=\"1767225600\">Empty</H3>");
  });

  it("wraps everything in one flagged root, so a folder named like a browser root survives the round trip", () => {
    const html = buildBookmarksHtml({
      folders: [
        { id: "f1", name: "Favorites", createdAt: at("2026-01-01T00:00:00Z") },
        { id: "f2", name: "Other bookmarks", createdAt: at("2026-01-01T00:00:00Z") },
      ],
      links: [
        { url: "https://a.test/fav", title: "Fav", description: null, folderId: "f1", createdAt: at("2026-01-01T00:00:00Z") },
        { url: "https://a.test/other", title: "Other", description: null, folderId: "f2", createdAt: at("2026-01-01T00:00:00Z") },
        { url: "https://a.test/home", title: "Home", description: null, folderId: null, createdAt: at("2026-01-01T00:00:00Z") },
      ],
    });
    expect(html).toContain(`<DT><H3 PERSONAL_TOOLBAR_FOLDER="true">${ROOT_FOLDER_NAME}</H3>`);
    expect(parseBookmarksHtml(html).map(({ url, folder }) => ({ url, folder }))).toEqual([
      { url: "https://a.test/fav", folder: "Favorites" },
      { url: "https://a.test/other", folder: "Other bookmarks" },
      { url: "https://a.test/home", folder: null },
    ]);
  });

  it("files a link under no folder when its folder isn't in the list", () => {
    const html = buildBookmarksHtml({
      folders: [],
      links: [{ url: "https://a.test/", title: "Orphan", description: null, folderId: "gone", createdAt: at("2026-01-01T00:00:00Z") }],
    });
    const items = parseBookmarksHtml(html);
    expect(items).toEqual([{ url: "https://a.test/", title: "Orphan", folder: null, createdAt: at("2026-01-01T00:00:00Z") }]);
  });

  it("round-trips through Purl's own importer", () => {
    const links = [
      { url: "https://a.test/one?x=1&y=2", title: "One & only", description: "First <desc>", folderId: "f1", createdAt: at("2026-03-01T12:34:56Z") },
      { url: "https://a.test/two", title: "Two", description: null, folderId: "f2", createdAt: at("2026-02-01T00:00:00Z") },
      { url: "https://a.test/three", title: "Three", description: null, folderId: null, createdAt: at("2026-01-01T00:00:00Z") },
    ];
    const html = buildBookmarksHtml({
      folders: [
        { id: "f1", name: "Reading & more", createdAt: at("2026-01-01T00:00:00Z") },
        { id: "f2", name: "Dev", createdAt: at("2026-01-01T00:00:00Z") },
      ],
      links,
    });
    expect(parseBookmarksHtml(html)).toEqual([
      { url: "https://a.test/one?x=1&y=2", title: "One & only", folder: "Reading & more", createdAt: at("2026-03-01T12:34:56Z") },
      { url: "https://a.test/two", title: "Two", folder: "Dev", createdAt: at("2026-02-01T00:00:00Z") },
      { url: "https://a.test/three", title: "Three", folder: null, createdAt: at("2026-01-01T00:00:00Z") },
    ]);
  });
});

describe("exportFileName", () => {
  it("dates the file in UTC", () => {
    expect(exportFileName(new Date("2026-10-31T23:59:59Z"))).toBe("purl-bookmarks-2026-10-31.html");
  });
});
