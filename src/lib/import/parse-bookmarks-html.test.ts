import { describe, expect, it } from "vitest";
import { parseBookmarksHtml } from "./parse-bookmarks-html";

const HEAD = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>`;

describe("parseBookmarksHtml", () => {
  it("reads a Chrome export, dropping the browser roots from folder paths", () => {
    const html = `${HEAD}
<DL><p>
  <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
  <DL><p>
    <DT><A HREF="https://example.com/direct" ADD_DATE="1700000000">Direct</A>
    <DT><H3 ADD_DATE="1700000000">Dev</H3>
    <DL><p>
      <DT><A HREF="https://example.com/dev?a=1&amp;b=2" ADD_DATE="1700000000">B &amp; C</A>
      <DT><H3>Tools</H3>
      <DL><p>
        <DT><A HREF="https://example.com/tool">A tool</A>
      </DL><p>
    </DL><p>
  </DL><p>
  <DT><H3 ADD_DATE="1700000000">Other bookmarks</H3>
  <DL><p>
    <DT><A HREF="https://example.com/other">Other</A>
  </DL><p>
</DL><p>`;
    const items = parseBookmarksHtml(html);
    expect(items.map((i) => [i.url, i.title, i.folder])).toEqual([
      ["https://example.com/direct", "Direct", null],
      ["https://example.com/dev?a=1&b=2", "B & C", "Dev"],
      ["https://example.com/tool", "A tool", "Dev / Tools"],
      ["https://example.com/other", "Other", null],
    ]);
    expect(items[0].createdAt).toEqual(new Date(1700000000000));
    expect(items[2].createdAt).toBeNull();
  });

  it("reads a Firefox export: flagged root, DD lines, long ICON, inner tags", () => {
    const icon = "data:image/png;base64," + "iVBORw0KGgo=".repeat(2000);
    const html = `${HEAD}
<DL><p>
  <DT><H3 UNFILED_BOOKMARKS_FOLDER="true">Other Bookmarks</H3>
  <DL><p>
    <DT><A HREF="https://example.com/a" ICON="${icon}">Plain <b>bold</b> title</A>
    <DD>A made-up description with <a>not a link</a> text
    <DT><A HREF="https://example.com/b">Second</A>
  </DL><p>
</DL><p>`;
    const items = parseBookmarksHtml(html);
    expect(items.map((i) => [i.url, i.title, i.folder])).toEqual([
      ["https://example.com/a", "Plain bold title", null],
      ["https://example.com/b", "Second", null],
    ]);
  });

  it("tells ADD_DATE units apart by magnitude", () => {
    const at = (v: string) =>
      parseBookmarksHtml(`<DL><DT><A HREF="https://example.com" ADD_DATE="${v}">x</A></DL>`)[0]
        .createdAt;
    const expected = new Date(1700000000000);
    expect(at("1700000000")).toEqual(expected);
    expect(at("1700000000000")).toEqual(expected);
    expect(at("1700000000000000")).toEqual(expected);
    expect(at("0")).toBeNull();
    expect(at("-5")).toBeNull();
    expect(at("soon")).toBeNull();
    expect(at("99999999999999999999")).toBeNull();
    expect(
      parseBookmarksHtml(`<DL><DT><A HREF="https://example.com">x</A></DL>`)[0].createdAt,
    ).toBeNull();
  });

  it("accepts lower-case tags and single-quoted attributes", () => {
    const html = `<dl><dt><h3>Reading</h3><dl><dt><a href='https://example.com/x?q=1&amp;r=2' add_date='1700000000'>Lower</a></dl></dl>`;
    expect(parseBookmarksHtml(html)).toEqual([
      {
        url: "https://example.com/x?q=1&r=2",
        title: "Lower",
        folder: "Reading",
        createdAt: new Date(1700000000000),
      },
    ]);
  });

  it("drops root-named folders at depth 1 but keeps them at depth 2", () => {
    for (const root of [
      "Favorites bar",
      "Bookmarks Toolbar",
      "Mobile bookmarks",
      "Bookmarks Menu",
      "Favourites",
    ]) {
      const html = `<DL><DT><H3>${root}</H3><DL><DT><A HREF="https://example.com/r">r</A></DL>
        <DT><H3>Work</H3><DL><DT><H3>${root}</H3><DL><DT><A HREF="https://example.com/n">n</A></DL></DL></DL>`;
      const items = parseBookmarksHtml(html);
      expect(items.map((i) => i.folder)).toEqual([null, `Work / ${root}`]);
    }
  });

  it("decodes numeric entities and survives malformed input", () => {
    const html = `<DL><DT><A HREF="https://example.com/&#x61;&#98;">Caf&#233; &#128512; &#99999999999;</A>`;
    const [item] = parseBookmarksHtml(html);
    expect(item.url).toBe("https://example.com/ab");
    expect(item.title.startsWith("Café 😀")).toBe(true);
    expect(() => parseBookmarksHtml('<DL><A HREF="x')).not.toThrow();
    expect(parseBookmarksHtml("")).toEqual([]);
    expect(parseBookmarksHtml("</DL></DL><A>no href</A>")).toEqual([]);
  });
});
