import { describe, expect, it } from "vitest";
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
