import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "./html-to-markdown";
import { MARKDOWN_PAGES, markdownRoute, pathForMarkdownKey, wantsMarkdown } from "./markdown-negotiation";

describe("htmlToMarkdown", () => {
  it("keeps the main content and drops scripts, nav chrome and buttons", () => {
    const md = htmlToMarkdown(
      `<header>Nope</header><main><h1>Title</h1><p>Hello <a href="/x">there</a></p>` +
        `<script>alert(1)</script><button>Click</button><ul><li>One</li></ul></main>`,
    );
    expect(md).toContain("# Title\n\nHello [there](/x)");
    expect(md).toMatch(/-\s+One/);
    expect(md).not.toMatch(/Nope|alert|Click/);
  });
});

describe("wantsMarkdown", () => {
  it("is true only when text/markdown is listed", () => {
    expect(wantsMarkdown("text/markdown")).toBe(true);
    expect(wantsMarkdown("text/markdown, text/html;q=0.5")).toBe(true);
    expect(wantsMarkdown("text/html,application/xhtml+xml,*/*;q=0.8")).toBe(false);
    expect(wantsMarkdown(null)).toBe(false);
  });
  it("covers the home page and the static pages", () => {
    expect(markdownRoute("/")).toBe("/api/markdown/home");
    expect(markdownRoute("/docs/api")).toBe("/api/markdown/api");
    expect(markdownRoute("/home")).toBeNull();
    expect(pathForMarkdownKey("mcp")).toBe("/docs/mcp");
    expect(pathForMarkdownKey("nope")).toBeNull();
    expect(Object.keys(MARKDOWN_PAGES)).toContain("/privacy");
  });
});
