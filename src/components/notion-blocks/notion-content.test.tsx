import { describe, expect, it } from "vitest";
import type { RichTextItemResponse } from "@notionhq/client";
import type { NotionBlock } from "notionic";
import { buildPageIdToPath } from "@/lib/notion-links";
import { NotionContent } from ".";
import { block, renderToHtml, richText } from "./test-utils";

// notionic renders the blocks; these cover what Purl sets around it.

const PRIVACY_ID = "244b1726-8ab3-83c3-9388-87a7a5748b73";
const UNPUBLISHED_ID = "11111111-2222-3333-4444-555555555555";

function render(blocks: NotionBlock[]) {
  return renderToHtml(
    <NotionContent
      blocks={blocks}
      pageIdToPath={buildPageIdToPath([{ id: PRIVACY_ID, slug: "privacy" }])}
    />,
  );
}

const para = (...text: RichTextItemResponse[]) =>
  block("paragraph", { rich_text: text });

describe("NotionContent", () => {
  it("links Notion pages to their static page, and others as text", async () => {
    const html = await render([
      para(
        richText("privacy", { href: `/${PRIVACY_ID.replace(/-/g, "")}` }),
        richText(" and "),
        richText("draft", { href: `https://www.notion.so/Draft-${UNPUBLISHED_ID.replace(/-/g, "")}` }),
      ),
    ]);
    expect(html).toMatch(/<a [^>]*href="\/privacy"/);
    expect(html).not.toContain("notion.so");
    expect(html).toContain("draft");
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("keeps purl.live links in the tab, as paths, and opens other sites in a new one", async () => {
    const html = await render([
      para(
        richText("terms", { href: "https://purl.live/terms#cookies" }),
        richText("elsewhere", { href: "https://example.com/" }),
      ),
    ]);
    expect(html).toMatch(/<a href="\/terms#cookies"(?![^>]*_blank)[^>]*>terms</);
    expect(html).toMatch(/<a href="https:\/\/example.com\/" target="_blank" rel="noopener noreferrer"/);
  });

  it("serves uploaded images through the file route, and linked ones as they are", async () => {
    const html = await render([
      block(
        "image",
        { type: "file", file: { url: "https://prod-files-secure.s3.amazonaws.com/x.png", expiry_time: "" }, caption: [] },
        { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
      ),
      block("image", { type: "external", external: { url: "https://purl.live/pages/a.png" }, caption: [] }),
    ]);
    expect(html).toContain('src="/api/notion/file/aaaaaaaabbbbccccddddeeeeeeeeeeee"');
    expect(html).not.toContain("amazonaws");
    expect(html).toContain('src="https://purl.live/pages/a.png"');
  });

  describe("code blocks", () => {
    const code = (language: string, text: string, caption: RichTextItemResponse[] = []) =>
      block("code", { language, rich_text: [richText(text)], caption });

    it("highlights known languages inside an accessible frame", async () => {
      const html = await render([code("JSON", '{"a":1}')]);
      expect(html).toContain("<figure");
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('aria-label="Code, JSON"');
      expect(html).toContain("--shiki-dark");
      expect(html).toContain('aria-label="Copy code"');
      const pre = html.match(/<pre[\s\S]*<\/pre>/)![0];
      expect(pre.match(/<code/g)).toHaveLength(1);
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
