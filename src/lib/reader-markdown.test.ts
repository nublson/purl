import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cutMarkdown,
  extractArticle,
  extractReaderMarkdown,
} from "./reader-markdown";

const BASE = "https://example.com/blog/post";
const fixture = (n: string) =>
  readFileSync(join(__dirname, "reader-fixtures", n), "utf8");

function articleMarkdown(): string {
  const article = extractArticle(fixture("article.html"), BASE);
  expect(article).not.toBeNull();
  return extractReaderMarkdown(article!.content, BASE);
}

describe("reader markdown", () => {
  it("converts an article", () => {
    const md = articleMarkdown();
    expect(md).toContain("## Where they nest");
    expect(md).toMatch(/^-\s+Rafters/m);
    expect(md).toContain("```");
    expect(md).toContain("![A swallow in flight](https://example.com/img/swallow.jpg)");
    expect(md).toContain("[the next post](https://example.com/blog/next)");
  });

  it("removes scripts, iframes, forms, nav, buttons and svg", () => {
    const md = articleMarkdown();
    for (const m of ["SCRIPTMARKER", "IFRAMEMARKER", "FORMMARKER", "NAVMARKER", "BUTTONMARKER", "SVGMARKER"]) {
      expect(md).not.toContain(m);
    }
  });

  it("drops non-http links and images", () => {
    const md = articleMarkdown();
    expect(md).not.toContain("data:");
    expect(md).not.toContain("javascript:");
    expect(md).toContain("click here");
  });

  it("returns null for a page without an article", () => {
    expect(extractArticle(fixture("no-article.html"), BASE)).toBeNull();
  });

  it("cuts on a line boundary", () => {
    const max = 300 * 1024;
    const cut = cutMarkdown("a\n".repeat(200_000), max);
    expect(cut.truncated).toBe(true);
    expect(cut.markdown.endsWith("a")).toBe(true);
    expect(Buffer.byteLength(cut.markdown)).toBeLessThanOrEqual(max);
    const short = cutMarkdown("héllo", max);
    expect(short).toEqual({ markdown: "héllo", truncated: false, bytes: 6 });
  });

  it("returns the article's title", () => {
    expect(extractArticle(fixture("article.html"), BASE)?.title).toBeTruthy();
  });

  it("escapes entity-encoded HTML in text but not in code", () => {
    const md = extractReaderMarkdown(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt;</p><p><code>a &lt; b</code></p>",
      BASE,
    );
    expect(md).toContain("\\<script>");
    expect(md).not.toMatch(/(^|[^\\])<script/);
    expect(md).not.toMatch(/(^|[^\\])<img/);
    expect(md).toContain("`a < b`");
  });

  it("keeps images inside a dropped link", () => {
    const md = extractReaderMarkdown(
      '<a href="javascript:x"><img src="/a.png" alt="A"></a>',
      "https://example.com/",
    );
    expect(md).toBe("![A](https://example.com/a.png)");
  });

  it("cuts one huge line at a whole character", () => {
    const cut = cutMarkdown("é".repeat(100), 51);
    expect(cut.truncated).toBe(true);
    expect(cut.markdown).toBe("é".repeat(25));
    expect(cut.markdown).not.toContain("\uFFFD");
  });

  it("keeps the last line when the cap lands on a newline", () => {
    const cut = cutMarkdown("aa\nbb\ncc", 5);
    expect(cut.markdown).toBe("aa\nbb");
  });

  it("closes a fence the cut left open", () => {
    const text = "intro\n```\n" + "code line\n".repeat(50);
    const cut = cutMarkdown(text, 100);
    expect(cut.markdown.endsWith("\n```")).toBe(true);
    expect(Buffer.byteLength(cut.markdown)).toBeLessThanOrEqual(100);
    expect((cut.markdown.match(/^```/gm) ?? []).length % 2).toBe(0);
  });
});
