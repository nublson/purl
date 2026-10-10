import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPageIdToPath } from "@/lib/notion-links";
import { NotionBlocks, createRenderContext } from ".";
import { block, renderToHtml, richText } from "./test-utils";
import type { NotionBlock } from "@/lib/notion";
import type { RichTextItemResponse } from "@notionhq/client";

const PRIVACY_ID = "244b1726-8ab3-83c3-9388-87a7a5748b73";

async function render(blocks: NotionBlock[]) {
  const context = createRenderContext(
    "terms",
    buildPageIdToPath([{ id: PRIVACY_ID, slug: "privacy" }]),
  );
  return renderToHtml(<NotionBlocks blocks={blocks} context={context} />);
}

const para = (...text: RichTextItemResponse[]) =>
  block("paragraph", { rich_text: text });

describe("NotionBlocks", () => {
  it("renders a paragraph", async () => {
    const html = await render([para(richText("Hello"))]);
    expect(html).toContain("<p");
    expect(html).toContain("Hello");
    expect(html).toContain("text-foreground");
  });

  it("renders nothing for no blocks or an empty paragraph", async () => {
    expect(await render([])).toBe("");
    expect(await render([para()])).not.toContain("<p");
  });

  it("renders a paragraph's nested blocks indented after its text, lists grouped", async () => {
    const html = await render([
      block(
        "paragraph",
        { rich_text: [richText("Parent")] },
        {
          children: [
            block("bulleted_list_item", { rich_text: [richText("one")] }),
            block("bulleted_list_item", { rich_text: [richText("two")] }),
          ],
        },
      ),
    ]);
    expect(html).toContain("flex flex-col gap-4 pl-6");
    expect(html.indexOf("one")).toBeGreaterThan(html.indexOf("Parent"));
    expect(html.match(/<ul/g)).toHaveLength(1);
    expect(html.match(/<li[ >]/g)).toHaveLength(2);
  });

  it("renders the children of an empty paragraph, without a text line", async () => {
    const html = await render([
      block("paragraph", { rich_text: [] }, { children: [para(richText("Kid"))] }),
    ]);
    expect(html).toContain("Kid");
    expect(html.match(/<p[ >]/g)).toHaveLength(1);
  });

  it("renders a quote's nested blocks inside the blockquote", async () => {
    const html = await render([
      block(
        "quote",
        { rich_text: [richText("Said")] },
        { children: [para(richText("Aside"))] },
      ),
    ]);
    const quote = html.match(/<blockquote[\s\S]*<\/blockquote>/)![0];
    expect(quote).toContain("Said");
    expect(quote.indexOf("Aside")).toBeGreaterThan(quote.indexOf("Said"));
  });

  it("lets inline links inherit the surrounding font size", async () => {
    const html = await render([
      block("heading_1", {
        rich_text: [richText("See ", {}), richText("terms", { href: "/terms" })],
      }),
    ]);
    const anchor = html.match(/<a [^>]*href="\/terms"[^>]*>/)![0];
    expect(anchor).not.toContain("text-base");
    expect(anchor).not.toContain("leading-normal");
    expect(anchor).toContain("text-[length:inherit]");
    expect(anchor).toContain("leading-[inherit]");
  });

  it("renders annotations", async () => {
    const a = (annotations: Record<string, unknown>) =>
      render([para(richText("x", { annotations }))]);
    expect(await a({ bold: true })).toContain("<strong");
    expect(await a({ italic: true })).toContain("<em");
    expect(await a({ strikethrough: true })).toContain("<s");
    expect(await a({ underline: true })).toContain("<u");
    expect(await a({ code: true })).toContain("<code");
    expect(await a({ color: "red" })).toContain("text-red-700");
    const bg = await a({ color: "blue_background" });
    expect(bg).toContain("<mark");
    expect(bg).toContain("bg-blue-100");
  });

  it("opens external links in a new tab and keeps internal links in the tab", async () => {
    const ext = await render([
      para(richText("e", { href: "https://example.com" })),
    ]);
    expect(ext).toContain('target="_blank"');
    expect(ext).toContain('rel="noopener noreferrer"');
    const int = await render([
      para(
        richText("p", {
          href: `https://www.notion.so/${PRIVACY_ID.replace(/-/g, "")}`,
        }),
      ),
    ]);
    expect(int).toContain('href="/privacy"');
    expect(int).not.toContain("target=");
  });

  it("escapes HTML-looking text and drops javascript: links", async () => {
    const html = await render([
      para(
        richText("<script>alert(1)</script>"),
        richText("click", { href: "javascript:alert(1)" }),
      ),
    ]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("click");
    expect(html).not.toContain('href="javascript');
  });

  it("renders headings with anchors", async () => {
    const rt = [richText("Save a link")];
    const html = await render([
      block("heading_1", { rich_text: rt }),
      block("heading_2", { rich_text: rt }),
      block("heading_3", { rich_text: rt }),
    ]);
    expect(html).toMatch(/<h2 [^>]*id="save-a-link"/);
    expect(html).toContain(
      '<a href="#save-a-link" aria-label="Link to section: Save a link"',
    );
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
  });

  it("renders nothing for a blank heading, and only its children when it has some", async () => {
    const blank = await render([block("heading_2", { rich_text: [richText("  ")] })]);
    expect(blank).not.toContain("<h3");
    expect(blank).not.toContain("<a");
    expect(blank).not.toContain("id=");
    const empty = await render([block("heading_1", { rich_text: [] })]);
    expect(empty).not.toContain("<h2");
    const withKids = await render([
      block(
        "heading_2",
        { rich_text: [] },
        { children: [para(richText("Kid"))] },
      ),
    ]);
    expect(withKids).toContain("Kid");
    expect(withKids).not.toContain("<h3");
    expect(withKids).not.toContain("<a ");
  });

  it("dedupes heading ids across the page", async () => {
    const rt = [richText("Request")];
    const html = await render([
      block("heading_2", { rich_text: rt }),
      block(
        "toggle",
        { rich_text: [richText("More")] },
        { children: [block("heading_2", { rich_text: rt })] },
      ),
    ]);
    expect(html).toContain('id="request"');
    expect(html).toContain('id="request-2"');
  });

  it("renders toggleable heading children after the heading", async () => {
    const html = await render([
      block(
        "heading_2",
        { rich_text: [richText("Head")], is_toggleable: true },
        { children: [para(richText("Inside"))] },
      ),
    ]);
    expect(html.indexOf("Head")).toBeLessThan(html.indexOf("Inside"));
  });

  it("renders quote, callout and toggle", async () => {
    const q = await render([block("quote", { rich_text: [richText("Q")] })]);
    expect(q).toContain("<blockquote");
    const c = await render([
      block(
        "callout",
        {
          rich_text: [richText("Note")],
          icon: { type: "emoji", emoji: "💡" },
        },
        { children: [para(richText("Kid"))] },
      ),
    ]);
    expect(c).toContain("💡");
    expect(c).toContain("bg-card");
    expect(c).toContain("Kid");
    const t = await render([
      block(
        "toggle",
        { rich_text: [richText("Sum")] },
        { children: [para(richText("Body"))] },
      ),
    ]);
    expect(t).toContain("<details");
    expect(t).toContain("<summary");
    expect(t).toContain("Body");
  });

  it("renders dividers, columns and synced blocks", async () => {
    expect(await render([block("divider")])).toContain('data-slot="separator"');
    const cols = await render([
      block(
        "column_list",
        {},
        {
          children: [
            block("column", {}, { children: [para(richText("Left"))] }),
            block("column", {}, { children: [para(richText("Right"))] }),
          ],
        },
      ),
    ]);
    expect(cols).toContain("Left");
    expect(cols).toContain("Right");
    expect(cols).toContain("md:grid-flow-col");
    const synced = await render([
      block(
        "synced_block",
        { synced_from: null },
        { children: [para(richText("Synced"))] },
      ),
    ]);
    expect(synced).toContain("Synced");
  });

  it("renders nothing for unsupported block types", async () => {
    expect(await render([block("child_page", { title: "x" })])).toBe(
      '<div class="flex flex-col gap-4"></div>',
    );
  });
});

describe("lists", () => {
  const item = (
    type: string,
    text: string,
    extra: Record<string, unknown> = {},
    children?: NotionBlock[],
  ) => block(type, { rich_text: [richText(text)], ...extra }, { children });

  it("groups bulleted items into one ul", async () => {
    const html = await render([
      item("bulleted_list_item", "a"),
      item("bulleted_list_item", "b"),
    ]);
    expect(html.match(/<ul/g)).toHaveLength(1);
    expect(html.match(/<li[ >]/g)).toHaveLength(2);
  });

  it("renders numbered items as an ol", async () => {
    const html = await render([
      item("numbered_list_item", "a"),
      item("numbered_list_item", "b"),
    ]);
    expect(html).toContain("<ol");
    expect(html).not.toContain("<ul");
  });

  it("nests child lists inside the li", async () => {
    const html = await render([
      item("bulleted_list_item", "a", {}, [item("bulleted_list_item", "child")]),
    ]);
    expect(html.match(/<ul/g)).toHaveLength(2);
    expect(html.indexOf("child")).toBeGreaterThan(html.indexOf("a"));
    expect(html.indexOf("</li>")).toBeGreaterThan(html.indexOf("child"));
  });

  it("renders to-dos with a disabled checkbox and struck-through checked text", async () => {
    const done = await render([item("to_do", "done", { checked: true })]);
    expect(done).toMatch(/<input type="checkbox" disabled=""[^>]* checked=""/);
    expect(done).toMatch(/<s>/);
    const open = await render([item("to_do", "open", { checked: false })]);
    expect(open).toContain('type="checkbox"');
    expect(open).not.toContain("checked");
    expect(open).not.toMatch(/<s>/);
  });
});

describe("media, links and tables", () => {
  afterEach(() => vi.restoreAllMocks());

  const ext = (url: string) => ({ type: "external", external: { url } });
  const IMG = "https://example.com/a.png";

  it("renders an external image with caption, or empty alt", async () => {
    const html = await render([
      block("image", { ...ext(IMG), caption: [richText("Claude settings")] }),
    ]);
    expect(html).toContain("<figure");
    expect(html).toContain(`src="${IMG}"`);
    expect(html).toContain('alt="Claude settings"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("<figcaption");
    const bare = await render([block("image", { ...ext(IMG), caption: [] })]);
    expect(bare).toContain('alt=""');
    expect(bare).not.toContain("<figcaption");
  });

  it("skips uploaded images with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = await render([
      block(
        "image",
        { type: "file", file: { url: "https://s3/x.png" }, caption: [] },
        { id: "img-1" },
      ),
    ]);
    expect(html).toBe('<div class="flex flex-col gap-4"></div>');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Static page "terms": skipped uploaded image img-1; link images instead',
    );
  });

  it("skips images whose URL is not http(s)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const url of ["data:image/png;base64,AAA", "javascript:alert(1)"]) {
      const html = await render([block("image", { ...ext(url), caption: [] })]);
      expect(html).not.toContain("<img");
    }
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("embeds YouTube videos and links other videos", async () => {
    const yt = await render([
      block("video", {
        ...ext("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        caption: [],
      }),
    ]);
    expect(yt).toContain("<iframe");
    expect(yt).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(yt).toContain('title="YouTube video"');
    expect(yt).toContain("allowFullScreen");
    const other = await render([
      block("video", { ...ext("https://vimeo.com/1"), caption: [] }),
    ]);
    expect(other).not.toContain("<iframe");
    expect(other).toContain('href="https://vimeo.com/1"');
    const file = await render([
      block("video", { type: "file", file: { url: "https://s3/v.mp4" }, caption: [] }),
    ]);
    expect(file).not.toContain("<iframe");
    expect(file).not.toContain("<a");
  });

  it("renders bookmarks as links and drops unsafe ones", async () => {
    const withCaption = await render([
      block("bookmark", { url: "https://example.com", caption: [richText("Example")] }),
    ]);
    expect(withCaption).toContain('href="https://example.com"');
    expect(withCaption).toContain(">Example<");
    const bare = await render([
      block("bookmark", { url: "https://example.com", caption: [] }),
    ]);
    expect(bare).toContain(">https://example.com<");
    const bad = await render([
      block("bookmark", { url: "javascript:alert(1)", caption: [] }),
    ]);
    expect(bad).not.toContain("<a");
  });

  it("links to a static page by its label, and ignores unknown pages", async () => {
    const html = await render([
      block("link_to_page", { type: "page_id", page_id: PRIVACY_ID }),
    ]);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain(">Privacy<");
    expect(html).not.toContain("_blank");
    const unknown = await render([
      block("link_to_page", {
        type: "page_id",
        page_id: "00000000-0000-0000-0000-000000000000",
      }),
    ]);
    expect(unknown).not.toContain("<a");
  });

  it("renders tables with column and row headers", async () => {
    const row = (...cells: string[]) =>
      block("table_row", { cells: cells.map((c) => [richText(c)]) });
    const html = await render([
      block(
        "table",
        { table_width: 2, has_column_header: true, has_row_header: true },
        { children: [row("H1", "H2"), row("a", "b")] },
      ),
    ]);
    expect(html).toContain("<thead");
    expect(html).toContain("<th");
    expect(html).toContain("<tbody");
    expect(html).toContain('<th scope="row"');
    expect(html.match(/<tbody/g)).toHaveLength(1);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Table"');
    expect(html).toContain('tabindex="0"');
    const noHead = await render([
      block(
        "table",
        { table_width: 1, has_column_header: false, has_row_header: false },
        { children: [row("x")] },
      ),
    ]);
    expect(noHead).not.toContain("<thead");
    expect(noHead).toContain("<td");
  });

  describe("code blocks", () => {
    const code = (language: string, text: string, caption: RichTextItemResponse[] = []) =>
      block("code", { language, rich_text: [richText(text)], caption });

    it("highlights known languages inside an accessible frame", async () => {
      const html = await render([code("JSON", '{"a":1}')]);
      expect(html).toContain("<figure");
      expect(html).toContain("JSON");
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('role="region"');
      expect(html).toContain('aria-label="Code, JSON"');
      expect(html).toContain("--shiki-dark");
      expect(html).toContain('aria-label="Copy code"');
    });

    it("renders the caption", async () => {
      const html = await render([code("JSON", "{}", [richText("A cap")])]);
      expect(html).toContain("<figcaption");
      expect(html).toContain("A cap");
    });

    it("falls back to plain text for unknown languages", async () => {
      const html = await render([code("Swift", 'let a = "<x>"')]);
      expect(html).toContain("<pre");
      expect(html).toContain("&lt;x&gt;");
      expect(html).not.toContain("--shiki-");
    });
  });
});
