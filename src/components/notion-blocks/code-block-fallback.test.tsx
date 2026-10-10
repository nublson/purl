import { describe, expect, it, vi } from "vitest";
import { buildPageIdToPath } from "@/lib/notion-links";
import { NotionBlocks, createRenderContext } from ".";
import { block, renderToHtml, richText } from "./test-utils";

vi.mock("@/lib/code-highlight", () => ({
  highlightCode: vi.fn().mockRejectedValue(new Error("boom")),
}));

describe("CodeBlock when highlighting throws", () => {
  it("renders plain text in the same frame", async () => {
    const context = createRenderContext("api", buildPageIdToPath([]));
    const html = await renderToHtml(
      <NotionBlocks
        context={context}
        blocks={[
          block("code", {
            language: "json",
            rich_text: [richText('{"a": "<b>"}')],
            caption: [],
          }),
        ]}
      />,
    );
    expect(html).toContain("<figure");
    expect(html).toContain("<pre");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("--shiki-");
  });
});
